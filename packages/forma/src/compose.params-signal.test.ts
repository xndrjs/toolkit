import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose, type CompositionRoot, type ExecutionContextArgs } from "./compose.js";
import { ok } from "./result.js";

type RequestParams = { readonly tenantId: string; readonly requestId: string };

describe("compose — params + AbortSignal", () => {
  it("per-context factory reads typed params; composition-lifetime has no params", async () => {
    const App = boundary("app");
    const Echo = App.intent("echo").contract<void, string, never>();
    const Shared = App.intent("shared").contract<void, "ok", never>();

    let seenContextParams: unknown;
    let seenCompositionParams: "missing" | "present" = "missing";

    const EchoProvider = Echo.provide.perContext<RequestParams>().with(({ params, lifetime }) => {
      seenContextParams = params;
      expect(lifetime.signal).toBeInstanceOf(AbortSignal);
      expect("params" in lifetime).toBe(false);
      return () => ok(params.tenantId);
    });
    const SharedProvider = Shared.provide.with((ctx) => {
      seenCompositionParams = "params" in ctx ? "present" : "missing";
      expect(ctx.lifetime.signal).toBeInstanceOf(AbortSignal);
      return () => ok("ok" as const);
    });

    const root = compose({
      surface: { echo: EchoProvider, shared: SharedProvider },
    });

    const params: RequestParams = { tenantId: "acme", requestId: "r1" };
    const result = await root.withExecutionContext(
      async (surface) => {
        await surface.shared();
        return surface.echo();
      },
      { params }
    );

    expect(result).toEqual({ ok: true, value: "acme" });
    expect(seenContextParams).toEqual(params);
    expect(seenCompositionParams).toBe("missing");
    await root.dispose();
  });

  it("dispose aborts the execution context signal (and Lifetime.signal)", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();

    let factorySignal: AbortSignal | undefined;

    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      factorySignal = lifetime.signal;
      return () => ok("pong" as const);
    });

    const root = compose({ surface: { ping: PingProvider } });
    const execution = root.openExecutionContext();
    await execution.surface.ping();
    expect(factorySignal?.aborted).toBe(false);
    expect(execution.signal.aborted).toBe(false);

    await execution.dispose();
    expect(factorySignal?.aborted).toBe(true);
    expect(execution.signal.aborted).toBe(true);
    await root.dispose();
  });

  it("open and with share ExecutionContextArgs (required params when inferred)", async () => {
    type Args = ExecutionContextArgs<RequestParams>;
    expectTypeOf<Args>().toEqualTypeOf<
      [options: { readonly params: RequestParams; readonly signal?: AbortSignal }]
    >();
    expectTypeOf<ExecutionContextArgs>().toEqualTypeOf<
      [] | [options?: { readonly params?: undefined; readonly signal?: AbortSignal }]
    >();

    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, RequestParams, never>();
    const PingProvider = Ping.provide.perContext<RequestParams>().with(({ params }) => {
      return () => ok(params);
    });

    const root = compose({ surface: { ping: PingProvider } });
    expectTypeOf(root).toEqualTypeOf<
      CompositionRoot<{ ping: typeof PingProvider }, RequestParams>
    >();

    const params: RequestParams = { tenantId: "t", requestId: "1" };
    const viaOpen = root.openExecutionContext({ params });
    expect(viaOpen.params).toEqual(params);
    expect(viaOpen.params).not.toBe(params); // frozen copy when object
    expect(Object.isFrozen(viaOpen.params)).toBe(true);
    await expect(viaOpen.surface.ping()).resolves.toEqual({ ok: true, value: params });
    await viaOpen.dispose();

    const viaWith = await root.withExecutionContext(async (surface) => surface.ping(), {
      params,
    });
    expect(viaWith).toEqual({ ok: true, value: params });
    await root.dispose();
  });

  it("infers merged params from two providers; host must pass both keys", async () => {
    const App = boundary("app");
    const A = App.intent("a").contract<void, string, never>();
    const B = App.intent("b").contract<void, string, never>();

    const AProvider = A.provide.perContext<{ readonly tenantId: string }>().with(({ params }) => {
      return () => ok(params.tenantId);
    });
    const BProvider = B.provide.perContext<{ readonly requestId: string }>().with(({ params }) => {
      return () => ok(params.requestId);
    });

    const root = compose({ surface: { a: AProvider, b: BProvider } });
    type Expected = { readonly tenantId: string } & { readonly requestId: string };
    expectTypeOf(root).toEqualTypeOf<
      CompositionRoot<{ a: typeof AProvider; b: typeof BProvider }, Expected>
    >();

    const result = await root.withExecutionContext(
      async (surface) => {
        const a = await surface.a();
        const b = await surface.b();
        if (!a.ok || !b.ok) {
          throw new Error("expected ok");
        }
        return { a: a.value, b: b.value };
      },
      { params: { tenantId: "acme", requestId: "r1" } }
    );
    expect(result).toEqual({ a: "acme", b: "r1" });
    await root.dispose();
  });

  it("type-rejects incompatible params keys across providers", () => {
    const App = boundary("app");
    const A = App.intent("a").contract<void, "ok", never>();
    const B = App.intent("b").contract<void, "ok", never>();

    const AProvider = A.provide.perContext<{ readonly role: string }>().with(() => () => ok("ok"));
    const BProvider = B.provide.perContext<{ readonly role: number }>().with(() => () => ok("ok"));

    // @ts-expect-error — incompatible execution params key(s): role
    compose({
      surface: { a: AProvider, b: BProvider },
    });
  });

  it("nested POJO ParamsReq is typed on the factory", async () => {
    type Nested = { readonly meta: { readonly role: "admin"; readonly count: number } };
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, Nested["meta"]["role"], never>();

    const PingProvider = Ping.provide.perContext<Nested>().with(({ params }) => {
      expectTypeOf(params.meta.role).toEqualTypeOf<"admin">();
      return () => ok(params.meta.role);
    });

    const root = compose({ surface: { ping: PingProvider } });
    const result = await root.withExecutionContext((surface) => surface.ping(), {
      params: { meta: { role: "admin", count: 2 } },
    });
    expect(result).toEqual({ ok: true, value: "admin" });
    await root.dispose();
  });

  it("compose<Superset>() accepts extra fields; too-narrow Explicit fails", async () => {
    type Required = { readonly tenantId: string };
    type Superset = { readonly tenantId: string; readonly region: string };

    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, string, never>();
    const PingProvider = Ping.provide.perContext<Required>().with(({ params }) => {
      return () => ok(params.tenantId);
    });

    const wide = compose<Superset>()({ surface: { ping: PingProvider } });
    const result = await wide.withExecutionContext((surface) => surface.ping(), {
      params: { tenantId: "acme", region: "eu" },
    });
    expect(result).toEqual({ ok: true, value: "acme" });
    await wide.dispose();

    // @ts-expect-error — Explicit params do not satisfy provider ParamsReq
    compose<{ readonly other: string }>()({ surface: { ping: PingProvider } });
  });

  it("void params allows open/with with no options (lexical vs host ownership)", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(() => () => ok("pong" as const));

    const root = compose({ surface: { ping: PingProvider } });
    await expect(root.withExecutionContext((surface) => surface.ping())).resolves.toEqual({
      ok: true,
      value: "pong",
    });

    await using execution = root.openExecutionContext();
    expect(execution.params).toBeUndefined();
    await expect(execution.surface.ping()).resolves.toEqual({ ok: true, value: "pong" });
  });

  it("optional host signal aborts the context signal without owning dispose", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.perContext().with(() => {
      return () => ok("pong" as const);
    });

    const host = new AbortController();
    const root = compose({ surface: { ping: PingProvider } });
    const execution = root.openExecutionContext({ signal: host.signal });
    expect(execution.signal.aborted).toBe(false);
    host.abort();
    expect(execution.signal.aborted).toBe(true);
    await execution.dispose();
    await root.dispose();
  });
});
