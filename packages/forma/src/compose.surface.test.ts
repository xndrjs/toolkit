import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { ok } from "./result.js";

describe("compose — surface hygiene (F5/F7)", () => {
  it("throws when surface alias is dispose (reserved for lifecycle)", () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );

    expect(() =>
      // @ts-expect-error — Surface alias(es) reserved for lifecycle: dispose
      compose({
        surface: { dispose: PingProvider },
      })
    ).toThrow(/Surface alias "dispose" is reserved/);
  });

  it("throws when surface alias is __proto__", () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );

    const surface = Object.create(null) as Record<string, typeof PingProvider>;
    surface.__proto__ = PingProvider;

    expect(() =>
      compose({
        surface,
      })
    ).toThrow(/__proto__/);
  });

  it("throws when surface has a symbol alias", () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );

    const sym = Symbol("ping");
    const surface = { ping: PingProvider, [sym]: PingProvider };

    expect(() =>
      // @ts-expect-error — Surface aliases must be string keys
      compose({
        surface,
      })
    ).toThrow(/Surface keys must be strings; got symbol/);
  });

  it("keeps ctx.dispose as lifecycle after a normal surface compose", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );

    const root = compose({ surface: { ping: PingProvider } });
    const ctx = root.createExecutionContext();

    expectTypeOf(ctx.dispose).toEqualTypeOf<() => Promise<void>>();
    await expect(ctx.ping()).resolves.toEqual({ ok: true, value: "pong" });
    await expect(ctx.dispose()).resolves.toBeUndefined();
    await root.dispose();
  });
});
