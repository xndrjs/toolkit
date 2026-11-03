import { describe, expect, it } from "vitest";
import { boundary } from "@xndrjs/forma";
import { compose } from "@xndrjs/forma";
import { success } from "@xndrjs/forma";

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
      return () => success("pong" as const);
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    const ctx = root.openExecutionContext();

    const p1 = ctx.surface.ping();
    const p2 = ctx.surface.ping();
    release();

    await expect(p1).resolves.toEqual({ kind: "success", value: "pong" });
    await expect(p2).resolves.toEqual({ kind: "success", value: "pong" });
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
      return () => success("pong" as const);
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
      onUnexpectedFailure: () => undefined,
    });
    const ctx = root.openExecutionContext();

    const failed = await ctx.surface.ping();
    expect(failed.kind).toBe("unexpectedFailure");
    expect(attempts).toBe(1);

    await expect(ctx.surface.ping()).resolves.toEqual({ kind: "success", value: "pong" });
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

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
      onUnexpectedFailure: () => undefined,
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.ping();
    expect(outcome.kind).toBe("unexpectedFailure");
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

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
      onUnexpectedFailure: () => undefined,
    });
    const ctx = root.openExecutionContext();

    let caught: unknown;
    try {
      await ctx.surface.ping();
    } catch (error) {
      caught = error;
    }

    // Cleanup failure remains outside the Contract (lifecycle channel).
    expect(caught).toBeInstanceOf(SuppressedError);
    const suppressed = caught as SuppressedError;
    expect(suppressed.error).toBeInstanceOf(AggregateError);
    // Factory cause is totalized before rollback; suppressed payload is the carrier.
    expect(suppressed.suppressed).toMatchObject({
      outcome: { kind: "unexpectedFailure" },
    });
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
      return () => success("pong" as const);
    });

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

  it("seals Lifetime after a successful materialization (scope still open)", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let stolenLifetime: { onDispose(cleanup: () => void): void } | undefined;
    const PingProvider = Ping.provide.with(({ lifetime }) => {
      stolenLifetime = lifetime;
      return () => success("pong" as const);
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
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
      return () => success(instance);
    });

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    await root.withExecutionContext(async (surface) => {
      const a = await surface.ping();
      const b = await surface.ping();
      expect(setups).toBe(1);
      if (a.kind !== "success" || b.kind !== "success") {
        throw new Error("expected success");
      }
      expect(a.value).toBe(b.value);
    });
    await root.dispose();
  });
});
