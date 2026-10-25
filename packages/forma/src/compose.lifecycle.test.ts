import { describe, expect, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { ok } from "./result.js";

describe("compose — lifecycle and disposal", () => {
  it("reuses a default (composition-lifetime) instance across two execution contexts", async () => {
    const Health = boundary("health");
    const Ping = Health.intent<void, { readonly n: number }, never>("ping");

    let setups = 0;
    const PingProvider = Ping.provide.with(() => {
      setups += 1;
      const instance = { n: setups };
      return () => ok(instance);
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
    const Ping = Health.intent<void, { readonly n: number }, never>("ping");

    let setups = 0;
    const PingProvider = Ping.provide.perContext().with(() => {
      setups += 1;
      const instance = { n: setups };
      return () => ok(instance);
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
    const Ping = Health.intent<void, "pong", never>("ping");

    let factoryRuns = 0;
    const base = Ping.provide.with(() => ok("pong"));
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
    const Ping = Health.intent<void, "pong", never>("ping");
    const Ready = Health.intent<void, true, never>("ready");

    const stub = { disposed: false };
    const PingProvider = Ping.provide
      .perContext()
      .using({ ready: Ready })
      .with((_deps, life) => {
        life.onDispose(async () => {
          stub.disposed = true;
        });
        return () => ok("pong" as const);
      });
    const ReadyProvider = Ready.provide.with(() => ok(true as const));

    const root = compose({
      surface: { ping: PingProvider },
      providers: [ReadyProvider],
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
    const Ping = Health.intent<void, "pong", never>("ping");
    const Ready = Health.intent<void, true, never>("ready");

    const stub = { disposed: false };
    const PingProvider = Ping.provide.using({ ready: Ready }).with((_deps, life) => {
      life.onDispose(async () => {
        stub.disposed = true;
      });
      return () => ok("pong" as const);
    });
    const ReadyProvider = Ready.provide.with(() => ok(true as const));

    const root = compose({
      surface: { ping: PingProvider },
      providers: [ReadyProvider],
    });
    const ctx = root.createExecutionContext();

    await ctx.ping();
    await ctx.dispose();
    expect(stub.disposed).toBe(false);

    await root.dispose();
    expect(stub.disposed).toBe(true);
  });

  it("ctx.dispose() does not run composition-lifetime cleanup", async () => {
    const Health = boundary("health");
    const Ping = Health.intent<void, "pong", never>("ping");
    const Scoped = Health.intent<void, "pong", never>("scoped");
    const Ready = Health.intent<void, true, never>("ready");

    const compositionStub = { disposed: false };
    const contextStub = { disposed: false };

    const SharedProvider = Ping.provide.using({ ready: Ready }).with((_deps, life) => {
      life.onDispose(() => {
        compositionStub.disposed = true;
      });
      return () => ok("pong" as const);
    });

    const ScopedProvider = Scoped.provide
      .perContext()
      .using({ ready: Ready })
      .with((_deps, life) => {
        life.onDispose(() => {
          contextStub.disposed = true;
        });
        return () => ok("pong" as const);
      });

    const ReadyProvider = Ready.provide.with(() => ok(true as const));

    const root = compose({
      surface: { ping: SharedProvider, scoped: ScopedProvider },
      providers: [ReadyProvider],
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
