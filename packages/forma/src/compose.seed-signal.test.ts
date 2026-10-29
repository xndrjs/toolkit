import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose, type CompositionRoot, type ExecutionContextArgs } from "./compose.js";
import { ok } from "./result.js";

type RequestSeed = { readonly tenantId: string; readonly requestId: string };

describe("compose — seed + AbortSignal", () => {
  it("per-context factory reads seed; composition-lifetime Lifetime has no seed", async () => {
    const App = boundary("app");
    const Echo = App.intent("echo").contract<void, string, never>();
    const Shared = App.intent("shared").contract<void, "ok", never>();

    let seenContextSeed: unknown;
    let seenCompositionSeed: unknown | "missing" = "missing";

    const EchoProvider = Echo.provide.perContext().with(({ lifetime }) => {
      seenContextSeed = lifetime.seed;
      return () => ok(String((lifetime.seed as RequestSeed).tenantId));
    });
    const SharedProvider = Shared.provide.with(({ lifetime }) => {
      seenCompositionSeed = "seed" in lifetime ? lifetime.seed : "missing";
      expect(lifetime.signal).toBeInstanceOf(AbortSignal);
      return () => ok("ok" as const);
    });

    const root = compose<RequestSeed>()({
      surface: { echo: EchoProvider, shared: SharedProvider },
    });

    const seed: RequestSeed = { tenantId: "acme", requestId: "r1" };
    const result = await root.withExecutionContext(
      async (surface) => {
        await surface.shared();
        return surface.echo();
      },
      { seed }
    );

    expect(result).toEqual({ ok: true, value: "acme" });
    expect(seenContextSeed).toEqual(seed);
    expect(seenCompositionSeed).toBe("missing");
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

    const root = compose({ surface: { ping: PingProvider } });
    const execution = root.openExecutionContext();
    expect(execution.signal.aborted).toBe(false);

    await execution.surface.ping();
    expect(factorySignal!.aborted).toBe(false);
    expect(factorySignal).toBe(execution.signal);

    await execution.dispose();
    expect(execution.signal.aborted).toBe(true);
    expect(factorySignal!.aborted).toBe(true);
    await root.dispose();
  });

  it("root.dispose aborts composition-lifetime Lifetime.signal", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();

    let factorySignal: AbortSignal | undefined;
    const PingProvider = Ping.provide.with(({ lifetime }) => {
      factorySignal = lifetime.signal;
      return () => ok("pong" as const);
    });

    const root = compose({ surface: { ping: PingProvider } });
    const execution = root.openExecutionContext();
    await execution.surface.ping();
    expect(factorySignal!.aborted).toBe(false);

    await execution.dispose();
    expect(factorySignal!.aborted).toBe(false);

    await root.dispose();
    expect(factorySignal!.aborted).toBe(true);
  });

  it("open and with share ExecutionContextArgs (required seed when Seed is set)", async () => {
    type Args = ExecutionContextArgs<RequestSeed>;
    expectTypeOf<Args>().toEqualTypeOf<
      [options: { readonly seed: RequestSeed; readonly signal?: AbortSignal }]
    >();

    type VoidArgs = ExecutionContextArgs<void>;
    expectTypeOf<VoidArgs>().toEqualTypeOf<
      [] | [options?: { readonly seed?: undefined; readonly signal?: AbortSignal }]
    >();

    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, RequestSeed, never>();
    const PingProvider = Ping.provide.perContext().with(
      ({ lifetime }) =>
        () =>
          ok(lifetime.seed as RequestSeed)
    );

    const root = compose<RequestSeed>()({ surface: { ping: PingProvider } });
    expectTypeOf(root).toEqualTypeOf<CompositionRoot<{ ping: typeof PingProvider }, RequestSeed>>();

    const seed: RequestSeed = { tenantId: "t", requestId: "1" };

    const viaOpen = root.openExecutionContext({ seed });
    expect(viaOpen.seed).toEqual(seed);
    expect(viaOpen.seed).not.toBe(seed); // frozen copy when object
    expect(Object.isFrozen(viaOpen.seed)).toBe(true);
    await expect(viaOpen.surface.ping()).resolves.toEqual({ ok: true, value: seed });
    await viaOpen.dispose();

    const viaWith = await root.withExecutionContext(async (surface) => surface.ping(), { seed });
    expect(viaWith).toEqual({ ok: true, value: seed });

    await root.dispose();
  });

  it("host signal abort is reflected on the context signal without disposing yet", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(() => () => ok("pong" as const));
    const root = compose({ surface: { ping: PingProvider } });

    const host = new AbortController();
    const execution = root.openExecutionContext({ signal: host.signal });
    expect(execution.signal.aborted).toBe(false);

    host.abort();
    expect(execution.signal.aborted).toBe(true);

    // Host cancel cooperates via signal; ownership of dispose stays with the host.
    await execution.surface.ping();
    await execution.dispose();
    await root.dispose();
  });

  it("void Seed allows open/with with no options (lexical vs host ownership)", async () => {
    const App = boundary("app");
    const Ping = App.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(() => () => ok("pong" as const));
    const root = compose({ surface: { ping: PingProvider } });

    await expect(root.withExecutionContext((surface) => surface.ping())).resolves.toEqual({
      ok: true,
      value: "pong",
    });

    await using execution = root.openExecutionContext();
    expect(execution.seed).toBeUndefined();
    await expect(execution.surface.ping()).resolves.toEqual({ ok: true, value: "pong" });

    await root.dispose();
  });
});
