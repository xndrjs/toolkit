import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { ok, type Result } from "./result.js";

describe("compose — surface hello (ping)", () => {
  it("runs a surface alias end-to-end: compose → context → call → dispose", async () => {
    const Health = boundary("health");
    const Ping = Health.intent<void, "pong", never>("ping");

    let runs = 0;
    const PingProvider = Ping.provide.with(() => {
      runs += 1;
      return ok("pong" as const);
    });

    const root = compose({
      surface: { ping: PingProvider },
    });

    expect(runs).toBe(0);

    const ctx = root.createExecutionContext();
    expect(runs).toBe(0);
    expect(typeof ctx.ping).toBe("function");
    expect(typeof ctx.dispose).toBe("function");

    // Surface exposes only declared aliases — not other Intents.
    expect(ctx).not.toHaveProperty("findOrder");
    expectTypeOf(ctx.ping).toEqualTypeOf<
      (input: void) => Result<"pong", never> | Promise<Result<"pong", never>>
    >();
    expectTypeOf(ctx).not.toHaveProperty("findOrder");

    const result = await ctx.ping();
    expect(result).toEqual({ ok: true, value: "pong" });
    // Realization body runs on first alias call (lazy), not at compose / context open.
    expect(runs).toBe(1);

    await expect(ctx.dispose()).resolves.toBeUndefined();
  });

  it("materializes the provider factory only on first alias call (lazy)", async () => {
    const Health = boundary("health");
    const Ping = Health.intent<void, "pong", never>("ping");

    let materializations = 0;
    const base = Ping.provide.with(() => ok("pong" as const));
    const PingProvider = {
      ...base,
      factory: ((
        deps: Parameters<typeof base.factory>[0],
        lifetime: Parameters<typeof base.factory>[1]
      ) => {
        materializations += 1;
        return base.factory(deps, lifetime);
      }) as typeof base.factory,
    };
    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.createExecutionContext();

    expect(materializations).toBe(0);
    await ctx.ping();
    expect(materializations).toBe(1);
    await ctx.ping();
    expect(materializations).toBe(1);
  });
});
