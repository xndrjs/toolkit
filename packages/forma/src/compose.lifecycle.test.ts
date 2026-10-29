import { describe, expect, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { ok } from "./result.js";

describe("compose — lifecycle and disposal", () => {
  it("reuses a default (composition-lifetime) instance across two execution contexts", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, { readonly n: number }, never>();

    let setups = 0;
    const PingProvider = Ping.provide.with((_ctx) => {
      setups += 1;
      const instance = { n: setups };
      return function () {
        return ok(instance);
      };
    });

    const root = compose({ surface: { ping: PingProvider } });
    const ctx1 = root.createExecutionContext();
    const ctx2 = root.createExecutionContext();

    const a = await ctx1.ping();
    const b = await ctx2.ping();
    expect(a).toEqual({ ok: true, value: { n: 1 } });
    expect(b).toEqual({ ok: true, value: { n: 1 } });
    if (!a.ok || !b.ok) {
      throw new Error("expected ok results");
    }
    expect(a.value).toBe(b.value);
    expect(setups).toBe(1);

    await ctx1.dispose();
    await ctx2.dispose();
    await root.dispose();
  });

  it("materializes .perContext() once per context and reuses within that context", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, { readonly n: number }, never>();

    let setups = 0;
    const PingProvider = Ping.provide.perContext().with((_ctx) => {
      setups += 1;
      const instance = { n: setups };
      return function () {
        return ok(instance);
      };
    });

    const root = compose({ surface: { ping: PingProvider } });
    const ctx1 = root.createExecutionContext();
    const ctx2 = root.createExecutionContext();

    const a1 = await ctx1.ping();
    const a2 = await ctx1.ping();
    const b1 = await ctx2.ping();

    expect(setups).toBe(2);
    if (!a1.ok || !a2.ok || !b1.ok) {
      throw new Error("expected ok results");
    }
    expect(a1.value).toBe(a2.value);
    expect(a1.value).not.toBe(b1.value);
    expect(a1).toEqual({ ok: true, value: { n: 1 } });
    expect(b1).toEqual({ ok: true, value: { n: 2 } });

    await ctx1.dispose();
    await ctx2.dispose();
    await root.dispose();
  });

  it("coalesces concurrent first access so the factory runs once", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let factoryRuns = 0;
    const base = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong");
        }
    );
    const PingProvider = {
      ...base,
      factory: ((deps, life) => {
        factoryRuns += 1;
        return base.factory(deps, life);
      }) as typeof base.factory,
    };

    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.createExecutionContext();

    const [r1, r2] = await Promise.all([ctx.ping(), ctx.ping()]);
    expect(r1).toEqual({ ok: true, value: "pong" });
    expect(r2).toEqual({ ok: true, value: "pong" });
    expect(factoryRuns).toBe(1);

    await ctx.dispose();
    await root.dispose();
  });

  it("ctx.dispose() runs Lifetime.onDispose cleanup for .perContext() providers", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    const stub = { disposed: false };
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(async () => {
        stub.disposed = true;
      });
      return function () {
        return ok("pong" as const);
      };
    });

    const root = compose({
      surface: { ping: PingProvider },
    });
    const ctx = root.createExecutionContext();

    await ctx.ping();
    expect(stub.disposed).toBe(false);

    await ctx.dispose();
    expect(stub.disposed).toBe(true);

    await root.dispose();
  });

  it("root.dispose() runs composition-lifetime Lifetime.onDispose cleanup", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    const stub = { disposed: false };
    const PingProvider = Ping.provide.with(({ lifetime }) => {
      lifetime.onDispose(async () => {
        stub.disposed = true;
      });
      return function () {
        return ok("pong" as const);
      };
    });

    const root = compose({
      surface: { ping: PingProvider },
    });
    const ctx = root.createExecutionContext();

    await ctx.ping();
    await ctx.dispose();
    expect(stub.disposed).toBe(false);

    await root.dispose();
    expect(stub.disposed).toBe(true);
  });

  it("throws when a composition-lifetime provider depends on a .perContext() provider", async () => {
    // §15.7 — invalid composition→context lifetime edge (default capturing perContext).
    const Db = boundary("db");
    const Query = Db.intent("query").contract<void, { readonly conn: number }, never>();
    const Conn = Db.intent("conn").contract<void, { readonly id: number }, never>();

    let connSetups = 0;
    const ConnProvider = Conn.provide.perContext().with((_ctx) => {
      connSetups += 1;
      const instance = { id: connSetups };
      return function () {
        return ok(instance);
      };
    });

    const QueryProvider = Query.provide.using({ conn: Conn }).with(({ deps: { conn } }) => {
      // Capture conn op at composition lifetime — illegal if Conn is perContext.
      return async function () {
        const result = await conn();
        if (!result.ok) {
          throw new Error("expected ok conn");
        }
        return ok({ conn: result.value.id });
      };
    });

    // @ts-expect-error — Invalid lifetime edge: composition-lifetime depending on .perContext()
    const root = compose({
      surface: { query: QueryProvider },
      wiring: [ConnProvider],
    });
    const ctx = root.createExecutionContext();

    await expect(ctx.query()).rejects.toThrow(
      /composition-lifetime.*context-lifetime|cannot depend on a \.perContext/
    );

    await ctx.dispose();
    await root.dispose();
  });

  it("after ctx.dispose(), surface aliases throw instead of rematerializing", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let setups = 0;
    const PingProvider = Ping.provide.perContext().with((_ctx) => {
      setups += 1;
      return function () {
        return ok("pong" as const);
      };
    });

    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.createExecutionContext();

    await expect(ctx.ping()).resolves.toEqual({ ok: true, value: "pong" });
    expect(setups).toBe(1);

    await ctx.dispose();

    await expect(ctx.ping()).rejects.toThrow(/disposed|sealed/i);
    expect(setups).toBe(1);

    await root.dispose();
  });

  it("ctx.dispose() still runs later cleanups when an earlier one throws", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    const order: string[] = [];
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      // LIFO: registered first → runs after the throwing cleanup.
      lifetime.onDispose(async () => {
        order.push("later");
      });
      lifetime.onDispose(async () => {
        order.push("earlier");
        throw new Error("earlier cleanup failed");
      });
      return function () {
        return ok("pong" as const);
      };
    });

    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.createExecutionContext();
    await ctx.ping();

    await expect(ctx.dispose()).rejects.toThrow(/earlier cleanup failed/);
    expect(order).toEqual(["earlier", "later"]);

    await root.dispose();
  });

  it("ctx.dispose() does not run composition-lifetime cleanup", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const Scoped = Health.intent("scoped").contract<void, "pong", never>();

    const compositionStub = { disposed: false };
    const contextStub = { disposed: false };

    const SharedProvider = Ping.provide.with(({ lifetime }) => {
      lifetime.onDispose(() => {
        compositionStub.disposed = true;
      });
      return function () {
        return ok("pong" as const);
      };
    });

    const ScopedProvider = Scoped.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => {
        contextStub.disposed = true;
      });
      return function () {
        return ok("pong" as const);
      };
    });

    const root = compose({
      surface: { ping: SharedProvider, scoped: ScopedProvider },
    });
    const ctx = root.createExecutionContext();

    await ctx.ping();
    await ctx.scoped();
    await ctx.dispose();

    expect(contextStub.disposed).toBe(true);
    expect(compositionStub.disposed).toBe(false);

    await root.dispose();
    expect(compositionStub.disposed).toBe(true);
  });
});
