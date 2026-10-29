import { describe, expect, it } from "vitest";
import { boundary } from "@xndrjs/forma";
import { compose } from "@xndrjs/forma";
import { ok } from "@xndrjs/forma";

describe("compose — async factories and rollback", () => {
  it("coalesces concurrent first materialization of an async factory", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let factoryRuns = 0;
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    const PingProvider = Ping.provide.with(async ({ lifetime }) => {
      factoryRuns += 1;
      lifetime.onDispose(() => undefined);
      await hold;
      return () => ok("pong" as const);
    });

    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.openExecutionContext();

    const p1 = ctx.surface.ping();
    const p2 = ctx.surface.ping();
    release();

    await expect(p1).resolves.toEqual({ ok: true, value: "pong" });
    await expect(p2).resolves.toEqual({ ok: true, value: "pong" });
    expect(factoryRuns).toBe(1);

    await ctx.dispose();
    await root.dispose();
  });

  it("does not cache a rejected factory and allows a later retry", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let attempts = 0;
    const PingProvider = Ping.provide.with(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("setup boom");
      }
      return () => ok("pong" as const);
    });

    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.openExecutionContext();

    await expect(ctx.surface.ping()).rejects.toThrow(/setup boom/);
    expect(attempts).toBe(1);

    await expect(ctx.surface.ping()).resolves.toEqual({ ok: true, value: "pong" });
    expect(attempts).toBe(2);

    await ctx.dispose();
    await root.dispose();
  });

  it("rolls back partial Lifetime cleanups when the factory fails", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    const cleaned: string[] = [];
    const PingProvider = Ping.provide.perContext().with(async ({ lifetime }) => {
      lifetime.onDispose(() => {
        cleaned.push("a");
      });
      lifetime.onDispose(() => {
        cleaned.push("b");
      });
      throw new Error("factory failed");
    });

    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.openExecutionContext();

    await expect(ctx.surface.ping()).rejects.toThrow(/factory failed/);
    // LIFO rollback immediately — not deferred to ctx.dispose().
    expect(cleaned).toEqual(["b", "a"]);

    await ctx.dispose();
    expect(cleaned).toEqual(["b", "a"]);
    await root.dispose();
  });

  it("throws SuppressedError when factory and rollback both fail", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    const factoryError = new Error("factory failed");
    const PingProvider = Ping.provide.with(async ({ lifetime }) => {
      lifetime.onDispose(() => {
        throw new Error("rollback a");
      });
      lifetime.onDispose(() => {
        throw new Error("rollback b");
      });
      throw factoryError;
    });

    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.openExecutionContext();

    let caught: unknown;
    try {
      await ctx.surface.ping();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SuppressedError);
    const suppressed = caught as SuppressedError;
    expect(suppressed.error).toBeInstanceOf(AggregateError);
    expect(suppressed.suppressed).toBe(factoryError);
    const rollback = suppressed.error as AggregateError;
    expect(rollback.errors.map((e) => (e as Error).message)).toEqual(["rollback b", "rollback a"]);

    await ctx.dispose();
    await root.dispose();
  });

  it("rolls back when dispose races an in-flight async factory", async () => {
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

    const PingProvider = Ping.provide.perContext().with(async ({ lifetime }) => {
      lifetime.onDispose(() => {
        cleaned = true;
      });
      sawFactory();
      await factoryHold;
      return () => ok("pong" as const);
    });

    const root = compose({ surface: { ping: PingProvider } });
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

  it("seals Lifetime after a successful materialization (scope still open)", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let stolenLifetime: { onDispose(cleanup: () => void): void } | undefined;
    const PingProvider = Ping.provide.with(({ lifetime }) => {
      stolenLifetime = lifetime;
      return () => ok("pong" as const);
    });

    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.openExecutionContext();
    await ctx.surface.ping();

    expect(() => stolenLifetime!.onDispose(() => undefined)).toThrow(/sealed/i);

    await ctx.dispose();
    await root.dispose();
  });

  it("awaits an async factory and caches the operation once", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, { readonly n: number }, never>();

    let setups = 0;
    const PingProvider = Ping.provide.with(async ({ lifetime }) => {
      setups += 1;
      await Promise.resolve();
      const instance = { n: setups };
      lifetime.onDispose(() => undefined);
      return () => ok(instance);
    });

    const root = compose({ surface: { ping: PingProvider } });
    await root.withExecutionContext(async (surface) => {
      const a = await surface.ping();
      const b = await surface.ping();
      expect(setups).toBe(1);
      if (!a.ok || !b.ok) {
        throw new Error("expected ok");
      }
      expect(a.value).toBe(b.value);
    });
    await root.dispose();
  });
});
