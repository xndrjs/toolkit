import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "@xndrjs/forma";
import { compose, type CompositionRoot, type ExecutionContextArgs } from "@xndrjs/forma";
import { ok } from "@xndrjs/forma";

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
      entryBoundaries: [App],
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

    const root = compose({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
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

    const root = compose({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
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

  it("normalizes Params once as a shallow-frozen plain outer bag", async () => {
    type Params = {
      readonly label: string;
      readonly nested: { count: number };
    };
    const App = boundary("app");
    const Read = App.intent("read").contract<void, string, never>();
    let factoryParams: Readonly<Params> | undefined;
    const ReadProvider = Read.provide.perContext<Params>().with(({ params }) => {
      factoryParams = params;
      return () => ok(params.label);
    });
    const root = compose({
      entryBoundaries: [App],
      surface: { read: ReadProvider },
    });
    const input: Params = { label: "plain", nested: { count: 1 } };
    const execution = root.openExecutionContext({ params: input });

    expect(execution.params).not.toBe(input);
    expect(Object.isFrozen(execution.params)).toBe(true);
    expect(execution.params.nested).toBe(input.nested);
    expect(Object.isFrozen(execution.params.nested)).toBe(false);
    await execution.surface.read();
    expect(factoryParams).toBe(execution.params);

    await execution.dispose();
    await root.dispose();
  });

  it("accepts a null-prototype outer Params bag", async () => {
    type Params = { readonly label: string };
    const App = boundary("app");
    const Read = App.intent("read").contract<void, string, never>();
    const ReadProvider = Read.provide.perContext<Params>().with(
      ({ params }) =>
        () =>
          ok(params.label)
    );
    const root = compose({
      entryBoundaries: [App],
      surface: { read: ReadProvider },
    });
    const params = Object.assign(Object.create(null) as object, {
      label: "null-prototype",
    }) as Params;

    await expect(
      root.withExecutionContext((surface) => surface.read(), { params })
    ).resolves.toEqual({ ok: true, value: "null-prototype" });
    await root.dispose();
  });

  it("rejects non-POJO outer Params before opening an execution context", async () => {
    type Params = { readonly label?: string };
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    let materializations = 0;
    const PingProvider = Ping.provide.perContext<Params>().with(() => {
      materializations += 1;
      return () => ok("pong" as const);
    });
    const root = compose({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });

    class ClassParams {
      readonly label = "class";
    }
    const accessor = Object.defineProperty({}, "label", {
      enumerable: true,
      get: () => "accessor",
    });
    const symbolKey = { label: "symbol", [Symbol("extra")]: true };
    const nonEnumerable = Object.defineProperty({}, "label", {
      enumerable: false,
      value: "hidden",
    });
    const protoKey = Object.defineProperty({}, "__proto__", {
      enumerable: true,
      value: "forbidden",
    });
    const invalid: readonly unknown[] = [
      [],
      new Map(),
      new Date(),
      new ClassParams(),
      accessor,
      symbolKey,
      nonEnumerable,
      protoKey,
      () => undefined,
    ];

    for (const params of invalid) {
      expect(() => root.openExecutionContext({ params: params as Params })).toThrow(TypeError);
    }
    expect(materializations).toBe(0);

    await using execution = root.openExecutionContext({ params: { label: "valid" } });
    await expect(execution.surface.ping()).resolves.toEqual({ ok: true, value: "pong" });
    await root.dispose();
  });

  it("best-effort type checks reject invalid Params bag shapes", () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(() => () => ok("pong" as const));

    const assertTypeErrors = (): void => {
      // @ts-expect-error — primitive Params are not an object bag
      Ping.provide.perContext<string>();
      // @ts-expect-error — arrays are not a Params bag
      Ping.provide.perContext<readonly string[]>();
      // @ts-expect-error — functions are not a Params bag
      Ping.provide.perContext<() => void>();
      // @ts-expect-error — Params keys must be strings
      Ping.provide.perContext<Readonly<Record<symbol, string>>>();
      // @ts-expect-error — an invalid union constituent does not become a valid Params bag
      Ping.provide.perContext<{ readonly label: string } | readonly string[]>();

      // @ts-expect-error — compose<Explicit>() applies the same Params shape rule
      compose<readonly string[]>()({
        entryBoundaries: [App],
        surface: { ping: PingProvider },
      });
    };
    void assertTypeErrors;
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

    const root = compose({
      entryBoundaries: [App],
      surface: { a: AProvider, b: BProvider },
    });
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
      entryBoundaries: [App],
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

    const root = compose({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
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

    const wide = compose<Superset>()({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
    const result = await wide.withExecutionContext((surface) => surface.ping(), {
      params: { tenantId: "acme", region: "eu" },
    });
    expect(result).toEqual({ ok: true, value: "acme" });
    await wide.dispose();

    // @ts-expect-error — Explicit params do not satisfy provider ParamsReq
    compose<{ readonly other: string }>()({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
  });

  it("void params allows open/with with no options (lexical vs host ownership)", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(() => () => ok("pong" as const));

    const root = compose({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
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
    const root = compose({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
    const execution = root.openExecutionContext({ signal: host.signal });
    expect(execution.signal.aborted).toBe(false);
    host.abort();
    expect(execution.signal.aborted).toBe(true);
    await execution.dispose();
    await root.dispose();
  });

  it("fails fast when opening with an already-aborted host signal", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(() => () => ok("pong" as const));
    const root = compose({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
    const reason = new Error("host already stopped");

    expect(() => root.openExecutionContext({ signal: AbortSignal.abort(reason) })).toThrow(reason);
    await root.dispose();
  });

  it("rejects new unary work after host abort with signal.reason", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    let materializations = 0;
    const PingProvider = Ping.provide.with(() => {
      materializations += 1;
      return () => ok("pong" as const);
    });
    const root = compose({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
    const host = new AbortController();
    const execution = root.openExecutionContext({ signal: host.signal });
    const reason = new Error("host stopped");

    host.abort(reason);
    await expect(execution.surface.ping()).rejects.toBe(reason);
    expect(materializations).toBe(0);

    await execution.dispose();
    await root.dispose();
  });

  it("lets already-accepted unary work settle cooperatively after host abort", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    let invocationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      invocationStarted = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const PingProvider = Ping.provide.with(
      () =>
        async function () {
          invocationStarted();
          await gate;
          return ok("pong" as const);
        }
    );
    const root = compose({
      entryBoundaries: [App],
      surface: { ping: PingProvider },
    });
    const host = new AbortController();
    const execution = root.openExecutionContext({ signal: host.signal });

    const pending = execution.surface.ping();
    await started;
    host.abort(new Error("host stopped"));
    release();

    await expect(pending).resolves.toEqual({ ok: true, value: "pong" });
    await execution.dispose();
    await root.dispose();
  });
});
