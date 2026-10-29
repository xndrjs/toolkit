import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "@xndrjs/forma";
import { compose } from "@xndrjs/forma";
import { ok, type Result } from "@xndrjs/forma";

describe("compose — Design C execution API", () => {
  function pingRoot() {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );
    return compose({ surface: { ping: PingProvider } });
  }

  it("withExecutionContext: success + success returns callback value", async () => {
    const root = pingRoot();
    const result = await root.withExecutionContext(async (surface) => {
      expectTypeOf(surface.ping).toEqualTypeOf<(input: void) => Promise<Result<"pong", never>>>();
      expect(surface).not.toHaveProperty("dispose");
      return surface.ping();
    });
    expect(result).toEqual({ ok: true, value: "pong" });
    await root.dispose();
  });

  it("withExecutionContext: callback failure + cleanup success rethrows callback error", async () => {
    const root = pingRoot();
    await expect(
      root.withExecutionContext(async () => {
        throw new Error("callback failed");
      })
    ).rejects.toThrow(/callback failed/);
    await root.dispose();
  });

  it("withExecutionContext: callback success + cleanup failure rethrows cleanup error", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => {
        throw new Error("cleanup failed");
      });
      return () => ok("pong" as const);
    });
    const root = compose({ surface: { ping: PingProvider } });

    await expect(
      root.withExecutionContext(async (surface) => {
        await surface.ping();
        return "ok";
      })
    ).rejects.toThrow(/cleanup failed/);

    await root.dispose();
  });

  it("withExecutionContext: both failures → SuppressedError(cleanup, callback)", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => {
        throw new Error("cleanup failed");
      });
      return () => ok("pong" as const);
    });
    const root = compose({ surface: { ping: PingProvider } });

    try {
      await root.withExecutionContext(async (surface) => {
        await surface.ping();
        throw new Error("callback failed");
      });
      expect.unreachable("expected SuppressedError");
    } catch (error) {
      expect(error).toBeInstanceOf(SuppressedError);
      const suppressed = error as SuppressedError;
      expect(suppressed.error).toMatchObject({ message: "cleanup failed" });
      expect(suppressed.suppressed).toMatchObject({ message: "callback failed" });
    }

    await root.dispose();
  });

  it("withExecutionContext supports early return and sync callbacks", async () => {
    const root = pingRoot();

    const early = await root.withExecutionContext((surface) => {
      void surface;
      return 41;
    });
    expect(early).toBe(41);

    const sync = await root.withExecutionContext(() => "sync");
    expect(sync).toBe("sync");

    await root.dispose();
  });

  it("withExecutionContext deregisters the context from the root even on callback failure", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    let cleaned = false;
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => {
        cleaned = true;
      });
      return () => ok("pong" as const);
    });
    const root = compose({ surface: { ping: PingProvider } });

    await expect(
      root.withExecutionContext(async (surface) => {
        await surface.ping();
        throw new Error("boom");
      })
    ).rejects.toThrow(/boom/);
    expect(cleaned).toBe(true);

    // Root dispose should not see a leftover open context.
    await expect(root.dispose()).resolves.toBeUndefined();
  });

  it("withExecutionContext drains a fire-and-forget surface call before cleanup", async () => {
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
    const root = compose({ surface: { ping: PingProvider } });

    let pending!: Promise<Result<"pong", never>>;
    const withDone = root.withExecutionContext(async (surface) => {
      pending = surface.ping();
      // Stay in the callback until the op body is running so dispose drains
      // real in-flight work (not the pre-assertOpen materialize yield).
      await opEntered;
      return "returned";
    });

    await opEntered;
    expect(cleaned).toBe(false);
    release();

    await expect(withDone).resolves.toBe("returned");
    await expect(pending).resolves.toEqual({ ok: true, value: "pong" });
    expect(cleaned).toBe(true);

    await root.dispose();
  });

  it("escaped surface use after withExecutionContext throws", async () => {
    const root = pingRoot();
    let leaked!: (input: void) => Promise<Result<"pong", never>>;

    await root.withExecutionContext((surface) => {
      leaked = surface.ping;
    });

    await expect(leaked()).rejects.toThrow(/disposed/i);
    await root.dispose();
  });

  it("openExecutionContext + await using disposes via AsyncDisposable", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    let cleaned = false;
    const PingProvider = Ping.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => {
        cleaned = true;
      });
      return () => ok("pong" as const);
    });
    const root = compose({ surface: { ping: PingProvider } });

    {
      await using execution = root.openExecutionContext();
      const result = await execution.surface.ping();
      expect(result).toEqual({ ok: true, value: "pong" });
    }

    expect(cleaned).toBe(true);
    await root.dispose();
  });

  it("await using root closes via AsyncDisposable", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    let cleaned = false;
    const PingProvider = Ping.provide.with(({ lifetime }) => {
      lifetime.onDispose(() => {
        cleaned = true;
      });
      return () => ok("pong" as const);
    });

    {
      await using root = compose({ surface: { ping: PingProvider } });
      await root.withExecutionContext(async (surface) => {
        await surface.ping();
      });
    }

    expect(cleaned).toBe(true);
  });

  it("createExecutionContext remains a deprecated alias of openExecutionContext", async () => {
    const root = pingRoot();
    const a = root.createExecutionContext();
    expect(typeof a.surface.ping).toBe("function");
    await a.dispose();
    await root.dispose();
  });

  it("root.dispose during an active withExecutionContext callback closes the context", async () => {
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
    const root = compose({ surface: { ping: PingProvider } });

    const running = root.withExecutionContext(async (surface) => surface.ping());
    await opEntered;
    const rootDisposing = root.dispose();
    expect(cleaned).toBe(false);
    release();

    // In-flight surface work drains; context cleanup runs via root backstop;
    // withExecutionContext's trailing dispose shares the same settled promise.
    await expect(running).resolves.toEqual({ ok: true, value: "pong" });
    await expect(rootDisposing).resolves.toBeUndefined();
    expect(cleaned).toBe(true);
  });
});
