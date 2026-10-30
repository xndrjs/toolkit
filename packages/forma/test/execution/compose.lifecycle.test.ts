import { describe, expect, it } from "vitest";
import { boundary } from "@xndrjs/forma";
import { compose } from "@xndrjs/forma";
import { ok } from "@xndrjs/forma";

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

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx1 = root.openExecutionContext();
    const ctx2 = root.openExecutionContext();

    const a = await ctx1.surface.ping();
    const b = await ctx2.surface.ping();
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

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx1 = root.openExecutionContext();
    const ctx2 = root.openExecutionContext();

    const a1 = await ctx1.surface.ping();
    const a2 = await ctx1.surface.ping();
    const b1 = await ctx2.surface.ping();

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

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();

    const [r1, r2] = await Promise.all([ctx.surface.ping(), ctx.surface.ping()]);
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
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();

    await ctx.surface.ping();
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
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();

    await ctx.surface.ping();
    await ctx.dispose();
    expect(stub.disposed).toBe(false);

    await root.dispose();
    expect(stub.disposed).toBe(true);
  });

  it("narrows an auto provider when it depends on a .perContext() provider", async () => {
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
      return async function () {
        const result = await conn();
        if (!result.ok) {
          throw new Error("expected ok conn");
        }
        return ok({ conn: result.value.id });
      };
    });

    const root = compose({
      entryBoundaries: [Db],
      surface: { query: QueryProvider },
      wiring: [ConnProvider],
    });
    const first = root.openExecutionContext();
    await expect(first.surface.query()).resolves.toEqual({ ok: true, value: { conn: 1 } });
    await expect(first.surface.query()).resolves.toEqual({ ok: true, value: { conn: 1 } });
    await first.dispose();

    const second = root.openExecutionContext();
    await expect(second.surface.query()).resolves.toEqual({ ok: true, value: { conn: 2 } });
    await second.dispose();

    expect(root.describePlan().providers).toEqual([
      {
        intent: ["db", "query"],
        mode: "unary",
        origin: { kind: "boundary", id: "db" },
        lifetime: {
          declared: "auto",
          effective: "context",
          narrowedBy: [
            ["db", "query"],
            ["db", "conn"],
          ],
        },
      },
      {
        intent: ["db", "conn"],
        mode: "unary",
        origin: { kind: "boundary", id: "db" },
        lifetime: { declared: "context", effective: "context" },
      },
    ]);
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

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();

    await expect(ctx.surface.ping()).resolves.toEqual({ ok: true, value: "pong" });
    expect(setups).toBe(1);

    await ctx.dispose();

    await expect(ctx.surface.ping()).rejects.toThrow(/disposed|sealed/i);
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

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();
    await ctx.surface.ping();

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
      entryBoundaries: [Health],
      surface: { ping: SharedProvider, scoped: ScopedProvider },
    });
    const ctx = root.openExecutionContext();

    await ctx.surface.ping();
    await ctx.surface.scoped();
    await ctx.dispose();

    expect(contextStub.disposed).toBe(true);
    expect(compositionStub.disposed).toBe(false);

    await root.dispose();
    expect(compositionStub.disposed).toBe(true);
  });

  it("openExecutionContext() throws after root.dispose()", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(() => () => ok("pong" as const));

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    await root.dispose();

    expect(() => root.openExecutionContext()).toThrow(/disposed/i);
    expect(() => root.openExecutionContext()).toThrow(/disposed/i);
  });

  it("surface use after root.dispose() throws", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(() => () => ok("pong" as const));

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();
    await expect(ctx.surface.ping()).resolves.toEqual({ ok: true, value: "pong" });

    await root.dispose();

    await expect(ctx.surface.ping()).rejects.toThrow(/disposed/i);
  });

  it("concurrent ctx.dispose() callers share one promise", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => hold);
      return () => ok("pong" as const);
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();
    await ctx.surface.ping();

    const first = ctx.dispose();
    const second = ctx.dispose();
    expect(second).toBe(first);

    release();
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    await root.dispose();
  });

  it("concurrent root.dispose() callers share one promise", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const PingProvider = Ping.provide.with(({ lifetime }) => {
      lifetime.onDispose(() => hold);
      return () => ok("pong" as const);
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();
    await ctx.surface.ping();
    await ctx.dispose();

    const first = root.dispose();
    const second = root.dispose();
    expect(second).toBe(first);

    release();
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it("root.dispose() reaches disposed even when a composition cleanup fails", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    const PingProvider = Ping.provide.with(({ lifetime }) => {
      lifetime.onDispose(() => {
        throw new Error("composition cleanup failed");
      });
      return () => ok("pong" as const);
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();
    await ctx.surface.ping();
    await ctx.dispose();

    await expect(root.dispose()).rejects.toThrow(/composition cleanup failed/);
    expect(() => root.openExecutionContext()).toThrow(/disposed/i);
  });

  it("root.dispose() closes open execution contexts as backstop", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    const stub = { disposed: false };
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => {
        stub.disposed = true;
      });
      return () => ok("pong" as const);
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();
    await ctx.surface.ping();
    expect(stub.disposed).toBe(false);

    await root.dispose();
    expect(stub.disposed).toBe(true);
    await expect(ctx.surface.ping()).rejects.toThrow(/disposed/i);
  });

  it("ctx.dispose() waits for an in-flight surface call before running cleanups", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sawOp!: () => void;
    const opEntered = new Promise<void>((resolve) => {
      sawOp = resolve;
    });
    let cleaned = false;
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => {
        cleaned = true;
      });
      return async () => {
        sawOp();
        await hold;
        return ok("pong" as const);
      };
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();

    const pending = ctx.surface.ping();
    await opEntered;
    const disposing = ctx.dispose();
    expect(cleaned).toBe(false);

    release();
    await expect(pending).resolves.toEqual({ ok: true, value: "pong" });
    await expect(disposing).resolves.toBeUndefined();
    expect(cleaned).toBe(true);

    await root.dispose();
  });

  it("ctx.dispose() during per-context factory drains that factory's cleanups", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let releaseFactory!: () => void;
    const factoryHold = new Promise<void>((resolve) => {
      releaseFactory = resolve;
    });
    let sawFactory!: () => void;
    const factoryEntered = new Promise<void>((resolve) => {
      sawFactory = resolve;
    });
    let cleaned = false;

    const base = Ping.provide.perContext().with(() => () => ok("pong" as const));
    const PingProvider = {
      ...base,
      factory: (async (...args: Parameters<typeof base.factory>) => {
        const [, life] = args;
        life.onDispose(() => {
          cleaned = true;
        });
        sawFactory();
        await factoryHold;
        return base.factory(...args);
      }) as unknown as typeof base.factory,
    };

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();

    const pending = ctx.surface.ping();
    await factoryEntered;
    const disposing = ctx.dispose();
    expect(cleaned).toBe(false);

    releaseFactory();
    await expect(pending).rejects.toThrow(/disposed/i);
    await expect(disposing).resolves.toBeUndefined();
    expect(cleaned).toBe(true);

    await expect(ctx.surface.ping()).rejects.toThrow(/disposed/i);
    await root.dispose();
  });
  it("Lifetime.onDispose after the scope is sealed throws", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let stolenLifetime: { onDispose(cleanup: () => void): void } | undefined;
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      stolenLifetime = lifetime;
      return () => ok("pong" as const);
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();
    await ctx.surface.ping();
    await ctx.dispose();

    expect(() => stolenLifetime!.onDispose(() => undefined)).toThrow(/sealed/i);
    await root.dispose();
  });

  it("composition-lifetime cache survives the context that first materialized it", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, { readonly n: number }, never>();

    let releaseFactory!: () => void;
    const factoryHold = new Promise<void>((resolve) => {
      releaseFactory = resolve;
    });
    let sawFactory!: () => void;
    const factoryEntered = new Promise<void>((resolve) => {
      sawFactory = resolve;
    });
    let setups = 0;
    const base = Ping.provide.with(() => {
      setups += 1;
      const instance = { n: setups };
      return () => ok(instance);
    });
    const PingProvider = {
      ...base,
      factory: (async (...args: Parameters<typeof base.factory>) => {
        sawFactory();
        await factoryHold;
        return base.factory(...args);
      }) as unknown as typeof base.factory,
    };

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx1 = root.openExecutionContext();
    const ctx2 = root.openExecutionContext();

    const first = ctx1.surface.ping();
    await factoryEntered;
    const disposing = ctx1.dispose();
    releaseFactory();

    await expect(first).resolves.toEqual({ ok: true, value: { n: 1 } });
    await expect(disposing).resolves.toBeUndefined();
    expect(setups).toBe(1);

    const second = await ctx2.surface.ping();
    expect(second).toEqual({ ok: true, value: { n: 1 } });
    if (!second.ok) {
      throw new Error("expected ok");
    }
    expect(second.value).toEqual({ n: 1 });
    expect(setups).toBe(1);

    await ctx2.dispose();
    await root.dispose();
  });
});
