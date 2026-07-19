import { describe, expect, it, vi } from "vitest";
import { createI18nHandle } from "@xndrjs/i18n";
import { IcuTranslationProviderMulti } from "@xndrjs/i18n";
import { createLoadCoordinator } from "./create-load-coordinator.js";

type MultiSchema = {
  default: {
    greeting: { en: string; it: string };
  };
  billing: {
    invoice: { en: string; it: string };
  };
};

type TestMultiParams = {
  default: {
    greeting: never;
  };
  billing: {
    invoice: never;
  };
};

const defaultEn = {
  greeting: { en: "Hello" },
};

const defaultIt = {
  greeting: { it: "Ciao" },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createLoadCoordinator", () => {
  it("dedupes in-flight loads for the same key", async () => {
    const coordinator = createLoadCoordinator<string>();
    const load = vi.fn(() => Promise.resolve("loaded"));
    const engine = {};
    const key = { engineRef: engine, partition: "en", namespaces: ["default"] as const };

    coordinator.request({ ...key, load });
    coordinator.request({ ...key, load });

    expect(load).toHaveBeenCalledTimes(1);
    expect(coordinator.getEntry(key)).toEqual({ status: "pending" });
    await expect(coordinator.getPromise()).resolves.toBe("loaded");
    expect(coordinator.revision).toBe(1);
    expect(coordinator.getResolvedScope()).toBe("loaded");
    expect(coordinator.getEntry(key)).toEqual({ status: "resolved", scope: "loaded" });
  });

  it("skips reload when the same key is already resolved", async () => {
    const coordinator = createLoadCoordinator<number>();
    const load = vi.fn(() => Promise.resolve(42));
    const engine = {};
    const key = {
      engineRef: engine,
      partition: undefined,
      namespaces: ["default"] as const,
    };

    coordinator.request({ ...key, load });
    await coordinator.getPromise();

    coordinator.request({ ...key, load });

    expect(load).toHaveBeenCalledTimes(1);
    expect(coordinator.revision).toBe(1);
    await expect(coordinator.getPromise()).resolves.toBe(42);
    expect(coordinator.getEntry(key)).toEqual({ status: "resolved", scope: 42 });
  });

  it("resolves synchronously when tryResolveSync returns a scope", () => {
    const coordinator = createLoadCoordinator<string>();
    const load = vi.fn(() => Promise.resolve("async"));
    const tryResolveSync = vi.fn(() => "sync");
    const engine = {};
    const key = {
      engineRef: engine,
      partition: "en",
      namespaces: ["default"] as const,
    };

    coordinator.request({ ...key, load, tryResolveSync });

    expect(load).not.toHaveBeenCalled();
    expect(tryResolveSync).toHaveBeenCalledTimes(1);
    expect(coordinator.getEntry(key)).toEqual({ status: "resolved", scope: "sync" });
    expect(coordinator.getResolvedScope()).toBe("sync");
  });

  it("falls back to async load when tryResolveSync returns null", async () => {
    const coordinator = createLoadCoordinator<string>();
    const load = vi.fn(() => Promise.resolve("async"));
    const tryResolveSync = vi.fn(() => null);
    const engine = {};
    const key = {
      engineRef: engine,
      partition: "en",
      namespaces: ["default"] as const,
    };

    coordinator.request({ ...key, load, tryResolveSync });

    expect(coordinator.getEntry(key)).toEqual({ status: "pending" });
    await expect(coordinator.getPromise()).resolves.toBe("async");
    expect(load).toHaveBeenCalledTimes(1);
    expect(coordinator.getEntry(key)).toEqual({ status: "resolved", scope: "async" });
  });

  it("keeps concurrent namespace loads independent", async () => {
    const coordinator = createLoadCoordinator<string>();
    const billing = deferred<string>();
    const user = deferred<string>();
    const engine = {};
    const billingKey = {
      engineRef: engine,
      partition: "en",
      namespaces: ["billing"] as const,
    };
    const userKey = {
      engineRef: engine,
      partition: "en",
      namespaces: ["user"] as const,
    };

    coordinator.request({ ...billingKey, load: () => billing.promise });
    const billingPromise = coordinator.getPromise();

    coordinator.request({ ...userKey, load: () => user.promise });
    const userPromise = coordinator.getPromise();

    expect(coordinator.getEntry(billingKey)).toEqual({ status: "pending" });
    expect(coordinator.getEntry(userKey)).toEqual({ status: "pending" });

    billing.resolve("billing-scope");
    user.resolve("user-scope");

    await expect(billingPromise).resolves.toBe("billing-scope");
    await expect(userPromise).resolves.toBe("user-scope");
    expect(coordinator.revision).toBe(2);
    expect(coordinator.getEntry(billingKey)).toEqual({
      status: "resolved",
      scope: "billing-scope",
    });
    expect(coordinator.getEntry(userKey)).toEqual({
      status: "resolved",
      scope: "user-scope",
    });
  });

  it("caches distinct partitions without cancelling the earlier one", async () => {
    const coordinator = createLoadCoordinator<string>();
    const first = deferred<string>();
    const second = deferred<string>();
    const engine = {};

    coordinator.request({
      engineRef: engine,
      partition: "en",
      namespaces: ["default"],
      load: () => first.promise,
    });
    const enPromise = coordinator.getPromise();

    coordinator.request({
      engineRef: engine,
      partition: "it",
      namespaces: ["default"],
      load: () => second.promise,
    });
    const itPromise = coordinator.getPromise();

    first.resolve("en-scope");
    second.resolve("it-scope");

    await expect(enPromise).resolves.toBe("en-scope");
    await expect(itPromise).resolves.toBe("it-scope");
    expect(coordinator.revision).toBe(2);
  });

  it("notifies subscribers when a load resolves", async () => {
    const coordinator = createLoadCoordinator<string>();
    const pending = deferred<string>();
    const engine = {};
    const key = {
      engineRef: engine,
      partition: "en",
      namespaces: ["default"] as const,
    };
    const listener = vi.fn();

    const unsubscribe = coordinator.subscribe(listener);
    coordinator.request({ ...key, load: () => pending.promise });

    expect(listener).not.toHaveBeenCalled();
    expect(coordinator.getEntry(key)).toEqual({ status: "pending" });

    pending.resolve("ready");
    await expect(coordinator.getPromise()).resolves.toBe("ready");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(coordinator.revision).toBe(1);
    expect(coordinator.getEntry(key)).toEqual({ status: "resolved", scope: "ready" });

    unsubscribe();
    const other = deferred<string>();
    coordinator.request({
      engineRef: engine,
      partition: "it",
      namespaces: ["default"],
      load: () => other.promise,
    });
    other.resolve("other");
    await vi.waitFor(() => expect(coordinator.revision).toBe(2));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps an error entry and notifies subscribers on reject", async () => {
    const coordinator = createLoadCoordinator<string>();
    const pending = deferred<string>();
    const engine = {};
    const key = {
      engineRef: engine,
      partition: "en",
      namespaces: ["default"] as const,
    };
    const load = vi.fn(() => pending.promise);
    const listener = vi.fn();
    const failure = new Error("load failed");

    coordinator.subscribe(listener);
    coordinator.request({ ...key, load });

    expect(coordinator.getEntry(key)).toEqual({ status: "pending" });

    pending.reject(failure);
    await expect(coordinator.getPromise()).rejects.toThrow("load failed");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(coordinator.revision).toBe(1);
    expect(coordinator.getEntry(key)).toEqual({ status: "error", error: failure });
    expect(coordinator.getResolvedScope()).toBeNull();

    // Deduped: settled error entry is not retried until retry().
    coordinator.request({ ...key, load });
    expect(load).toHaveBeenCalledTimes(1);
    expect(coordinator.getEntry(key)).toEqual({ status: "error", error: failure });
  });

  it("retry() evicts an error entry so the next ensure reloads", async () => {
    const coordinator = createLoadCoordinator<string>();
    const engine = {};
    const key = {
      engineRef: engine,
      partition: "en",
      namespaces: ["default"] as const,
    };
    const load = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error("fail")))
      .mockImplementationOnce(() => Promise.resolve("ok"));

    coordinator.request({ ...key, load });
    await expect(coordinator.getPromise()).rejects.toThrow("fail");
    expect(coordinator.getEntry(key).status).toBe("error");

    coordinator.retry(key);
    expect(coordinator.getEntry(key)).toEqual({ status: "pending" });

    coordinator.request({ ...key, load });
    await expect(coordinator.getPromise()).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
    expect(coordinator.getEntry(key)).toEqual({ status: "resolved", scope: "ok" });
  });

  it("distinguishes different engineRef objects via WeakMap ids", async () => {
    const coordinator = createLoadCoordinator<string>();
    const engineA = {};
    const engineB = {};
    const loadA = vi.fn(() => Promise.resolve("a"));
    const loadB = vi.fn(() => Promise.resolve("b"));

    coordinator.request({
      engineRef: engineA,
      partition: "en",
      namespaces: ["default"],
      load: loadA,
    });
    const promiseA = coordinator.getPromise();
    coordinator.request({
      engineRef: engineB,
      partition: "en",
      namespaces: ["default"],
      load: loadB,
    });
    const promiseB = coordinator.getPromise();

    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(1);
    await expect(promiseA).resolves.toBe("a");
    await expect(promiseB).resolves.toBe("b");
    expect(
      coordinator.getEntry({ engineRef: engineA, partition: "en", namespaces: ["default"] })
    ).toEqual({ status: "resolved", scope: "a" });
    expect(
      coordinator.getEntry({ engineRef: engineB, partition: "en", namespaces: ["default"] })
    ).toEqual({ status: "resolved", scope: "b" });
  });

  it("returns pending for unknown keys without using React use()", () => {
    const coordinator = createLoadCoordinator<string>();
    expect(
      coordinator.getEntry({
        engineRef: {},
        partition: "en",
        namespaces: ["missing"],
      })
    ).toEqual({ status: "pending" });
    expect(coordinator.revision).toBe(0);
  });

  it("integrates with handle split-by-locale loads", async () => {
    const defaultLoader = vi.fn(async (locale: string) =>
      locale === "it" ? defaultIt : defaultEn
    );
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const handle = createI18nHandle(engine, {
      namespaceLoaders: {
        default: defaultLoader,
      },
    });
    const load = () => handle.load({ namespaces: ["default"], locale: "it" });
    const coordinator = createLoadCoordinator<Awaited<ReturnType<typeof load>>>();
    const key = {
      engineRef: engine,
      partition: "it",
      namespaces: ["default"] as const,
    };

    coordinator.request({ ...key, load });

    const scope = await coordinator.getPromise();
    expect(defaultLoader).toHaveBeenCalledWith("it", { locale: "it" });
    expect(scope.t("default", "greeting")).toBe("Ciao");
    expect(coordinator.revision).toBe(1);
    expect(coordinator.getEntry(key).status).toBe("resolved");
  });
});
