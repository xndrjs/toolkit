import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { ok, type Result } from "./result.js";

describe("compose — surface hello (ping)", () => {
  it("runs a surface alias end-to-end: compose → context → call → dispose", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let runs = 0;
    const PingProvider = Ping.provide.with(
      (_ctx) =>
        function () {
          runs += 1;
          return ok("pong" as const);
        }
    );

    const root = compose({
      surface: { ping: PingProvider },
    });

    expect(runs).toBe(0);

    const ctx = root.openExecutionContext();
    expect(runs).toBe(0);
    expect(typeof ctx.surface.ping).toBe("function");
    expect(typeof ctx.dispose).toBe("function");
    expect(typeof ctx[Symbol.asyncDispose]).toBe("function");
    // Aliases nest under surface — not flat on the owned handle.
    expect(ctx).not.toHaveProperty("ping");

    // Surface exposes only declared aliases — not other Intents.
    expect(ctx.surface).not.toHaveProperty("findOrder");
    // Surface aliases are always async (materialize + invoke), never sync Result.
    expectTypeOf(ctx.surface.ping).toEqualTypeOf<(input: void) => Promise<Result<"pong", never>>>();
    expectTypeOf(ctx.surface).not.toHaveProperty("findOrder");

    const result = await ctx.surface.ping();
    expect(result).toEqual({ ok: true, value: "pong" });
    // Realization body runs on first alias call (lazy), not at compose / context open.
    expect(runs).toBe(1);

    await expect(ctx.dispose()).resolves.toBeUndefined();
  });

  it("materializes the provider factory only on first alias call (lazy)", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    let materializations = 0;
    const base = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );
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
    const ctx = root.openExecutionContext();

    expect(materializations).toBe(0);
    await ctx.surface.ping();
    expect(materializations).toBe(1);
    await ctx.surface.ping();
    expect(materializations).toBe(1);
  });
});
