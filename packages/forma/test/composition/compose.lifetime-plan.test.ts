import { describe, expect, expectTypeOf, it } from "vitest";
import { aliasIntent } from "@xndrjs/forma";
import { boundary } from "@xndrjs/forma";
import { compose, type CompositionRoot } from "@xndrjs/forma";
import { ok } from "@xndrjs/forma";

describe("compose — effective lifetime plan", () => {
  it("narrows auto consumers transitively and owns their cleanup in the context", async () => {
    const App = boundary("app");
    const A = App.intent("a").contract<void, number, never>();
    const B = App.intent("b").contract<void, number, never>();
    const C = App.intent("c").contract<void, number, never>();

    const setups = { a: 0, b: 0, c: 0 };
    const cleanups: string[] = [];

    const CProvider = C.provide.perContext().with(({ lifetime }) => {
      const instance = ++setups.c;
      lifetime.onDispose(() => {
        cleanups.push(`c:${instance}`);
      });
      return () => ok(instance);
    });
    const BProvider = B.provide.using({ c: C }).with(({ deps: { c }, lifetime }) => {
      const instance = ++setups.b;
      lifetime.onDispose(() => {
        cleanups.push(`b:${instance}`);
      });
      return () => c();
    });
    const AProvider = A.provide.using({ b: B }).with(({ deps: { b }, lifetime }) => {
      const instance = ++setups.a;
      lifetime.onDispose(() => {
        cleanups.push(`a:${instance}`);
      });
      return () => b();
    });

    const root = compose({ surface: { a: AProvider }, wiring: [BProvider, CProvider] });
    expect(root.describePlan().providers).toEqual([
      {
        intent: ["app", "a"],
        declared: "auto",
        effective: "context",
        narrowedBy: [
          ["app", "a"],
          ["app", "b"],
          ["app", "c"],
        ],
      },
      {
        intent: ["app", "b"],
        declared: "auto",
        effective: "context",
        narrowedBy: [
          ["app", "b"],
          ["app", "c"],
        ],
      },
      { intent: ["app", "c"], declared: "context", effective: "context" },
    ]);

    const first = root.openExecutionContext();
    await expect(first.surface.a()).resolves.toEqual({ ok: true, value: 1 });
    await expect(first.surface.a()).resolves.toEqual({ ok: true, value: 1 });
    await first.dispose();
    expect(cleanups).toEqual(["a:1", "b:1", "c:1"]);

    const second = root.openExecutionContext();
    await expect(second.surface.a()).resolves.toEqual({ ok: true, value: 2 });
    await second.dispose();
    expect(setups).toEqual({ a: 2, b: 2, c: 2 });
    expect(cleanups).toEqual(["a:1", "b:1", "c:1", "a:2", "b:2", "c:2"]);
    await root.dispose();
  });

  it("rejects a transitive .perComposition() conflict at compose with its path", () => {
    const App = boundary("app");
    const Shared = App.intent("shared").contract<void, "ok", never>();
    const Middle = App.intent("middle").contract<void, "ok", never>();
    const Scoped = App.intent("scoped").contract<void, "ok", never>();

    const ScopedProvider = Scoped.provide.perContext().with(() => () => ok("ok" as const));
    const MiddleProvider = Middle.provide.using({ scoped: Scoped }).with(
      ({ deps: { scoped } }) =>
        () =>
          scoped()
    );
    const SharedProvider = Shared.provide
      .perComposition()
      .using({ middle: Middle })
      .with(
        ({ deps: { middle } }) =>
          () =>
            middle()
      );

    expect(() =>
      compose({
        surface: { shared: SharedProvider },
        wiring: [MiddleProvider, ScopedProvider],
      })
    ).toThrow(/Lifetime conflict: app\.shared.*app\.shared -> app\.middle -> app\.scoped/);
  });

  it("narrows through an Intent alias", async () => {
    const App = boundary("app");
    const Infra = boundary("infra");
    const Read = App.intent("read").contract<void, string, never>();
    const Required = App.intent("required").contract<void, string, never>();
    const Actual = Infra.intent("actual").contract<void, string, never>();

    let setups = 0;
    const ActualProvider = Actual.provide.perContext().with(() => {
      const instance = ++setups;
      return () => ok(`instance:${instance}`);
    });
    const ReadProvider = Read.provide.using({ required: Required }).with(
      ({ deps: { required } }) =>
        () =>
          required()
    );

    const root = compose({
      surface: { read: ReadProvider },
      wiring: [ActualProvider, aliasIntent(Required, Actual)],
    });
    expect(root.describePlan().providers[0]).toEqual({
      intent: ["app", "read"],
      declared: "auto",
      effective: "context",
      narrowedBy: [
        ["app", "read"],
        ["app", "required"],
        ["infra", "actual"],
      ],
    });

    await root.withExecutionContext((surface) => surface.read());
    await root.withExecutionContext((surface) => surface.read());
    expect(setups).toBe(2);
    await root.dispose();
  });

  it("propagates context ownership but not params capability", async () => {
    type Params = { readonly tenantId: string };
    const App = boundary("app");
    const Query = App.intent("query").contract<void, string, never>();
    const Connection = App.intent("connection").contract<void, string, never>();

    let querySignal: AbortSignal | undefined;
    let connectionSignal: AbortSignal | undefined;
    const ConnectionProvider = Connection.provide
      .perContext<Params>()
      .with(({ params, lifetime }) => {
        connectionSignal = lifetime.signal;
        return () => ok(params.tenantId);
      });
    const QueryProvider = Query.provide.using({ connection: Connection }).with((ctx) => {
      expect("params" in ctx).toBe(false);
      querySignal = ctx.lifetime.signal;
      return () => ctx.deps.connection();
    });

    const root = compose({
      surface: { query: QueryProvider },
      wiring: [ConnectionProvider],
    });
    expectTypeOf(root).toEqualTypeOf<CompositionRoot<{ query: typeof QueryProvider }, Params>>();

    const execution = root.openExecutionContext({ params: { tenantId: "acme" } });
    await expect(execution.surface.query()).resolves.toEqual({ ok: true, value: "acme" });
    expect(querySignal).toBe(execution.signal);
    expect(connectionSignal).toBe(execution.signal);
    await execution.dispose();
    await root.dispose();
  });
});
