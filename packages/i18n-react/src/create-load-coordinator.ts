/**
 * Load deduplication for lazy i18n namespace gates / HOCs.
 *
 * Supports multiple concurrent keys so parallel per-namespace gates can share
 * one coordinator. Each `(engine, partition, namespaces)` entry keeps its own
 * promise and status. Display state (keep-previous / pendingLocale / stable `t`)
 * lives here so gate components stay pure observers of `useSyncExternalStore`.
 */
import { createScopedT } from "./create-scoped-t.js";
import type {
  GetDisplayEntryOptions,
  LoadCoordinator,
  LoadCoordinatorEntry,
  LoadCoordinatorKey,
  LoadCoordinatorRequest,
  LoadDisplayEntry,
  ScopedScopeLike,
  ScopedTranslateFn,
} from "./types.js";

const engineIds = new WeakMap<object, number>();
let nextEngineId = 1;

function engineId(ref: unknown): number {
  if (ref === null || (typeof ref !== "object" && typeof ref !== "function")) {
    return 0;
  }
  const obj = ref as object;
  let id = engineIds.get(obj);
  if (id === undefined) {
    id = nextEngineId++;
    engineIds.set(obj, id);
  }
  return id;
}

function cacheKey(
  engineRef: unknown,
  partition: string | undefined,
  namespaces: readonly string[]
): string {
  return `${engineId(engineRef)}\0${partition ?? ""}\0${namespaces.join("\0")}`;
}

/** Gate identity for keep-previous (namespaces only — partition/locale can change). */
function gateId(engineRef: unknown, namespaces: readonly string[]): string {
  return `${engineId(engineRef)}\0${namespaces.join("\0")}`;
}

interface CacheEntry<Scope> {
  status: "pending" | "resolved" | "error";
  promise: Promise<Scope>;
  resolvedScope: Scope | null;
  error: unknown;
  requestId: number;
  /** Stable LoadCoordinatorEntry snapshot for getEntry(). */
  entrySnapshot: LoadCoordinatorEntry<Scope>;
}

interface DisplayCache {
  lastReady: { scope: ScopedScopeLike; locale: string } | null;
  /** Stable display entry object until inputs change. */
  displaySnapshot: LoadDisplayEntry<ScopedScopeLike> | null;
  /** Identity key for the last displaySnapshot. */
  displayKey: string | null;
  boundT: ScopedTranslateFn | null;
  boundTKey: string | null;
}

/**
 * Dedupes in-flight loads by `(engineRef, partition, namespaces)` and exposes
 * display snapshots + retry for manual pending/resolved/error rendering.
 */
export function createLoadCoordinator<Scope = ScopedScopeLike>(): LoadCoordinator<Scope> {
  let revision = 0;
  let nextRequestId = 0;
  const entries = new Map<string, CacheEntry<Scope>>();
  const displayByGate = new Map<string, DisplayCache>();
  const listeners = new Set<() => void>();
  let lastKey: string | null = null;

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function bumpAndNotify(): void {
    revision += 1;
    // Invalidate display snapshots that depend on entry status.
    for (const display of displayByGate.values()) {
      display.displaySnapshot = null;
      display.displayKey = null;
    }
    notify();
  }

  function markResolvedSync(key: string, syncScope: Scope): void {
    const entrySnapshot: LoadCoordinatorEntry<Scope> = {
      status: "resolved",
      scope: syncScope,
    };
    entries.set(key, {
      status: "resolved",
      promise: Promise.resolve(syncScope),
      resolvedScope: syncScope,
      error: null,
      requestId: ++nextRequestId,
      entrySnapshot,
    });
  }

  /**
   * SSR / getServerSnapshot: hydrate from peek/state only — never kick `load()`.
   */
  function ensureSync(input: LoadCoordinatorRequest<Scope>): void {
    const key = cacheKey(input.engineRef, input.partition, input.namespaces);
    lastKey = key;

    if (entries.has(key)) {
      return;
    }

    if (input.tryResolveSync === undefined) {
      return;
    }

    const syncScope = input.tryResolveSync();
    if (syncScope !== null) {
      markResolvedSync(key, syncScope);
    }
  }

  function ensure(input: LoadCoordinatorRequest<Scope>): void {
    const key = cacheKey(input.engineRef, input.partition, input.namespaces);
    lastKey = key;

    const existing = entries.get(key);
    if (existing !== undefined) {
      return;
    }

    if (input.tryResolveSync !== undefined) {
      const syncScope = input.tryResolveSync();
      if (syncScope !== null) {
        markResolvedSync(key, syncScope);
        return;
      }
    }

    const requestId = ++nextRequestId;
    const promise = input.load().then(
      (scope) => {
        const entry = entries.get(key);
        if (entry === undefined || entry.requestId !== requestId) {
          return scope;
        }
        entry.status = "resolved";
        entry.resolvedScope = scope;
        entry.error = null;
        entry.entrySnapshot = { status: "resolved", scope };
        bumpAndNotify();
        return scope;
      },
      (error: unknown) => {
        const entry = entries.get(key);
        if (entry !== undefined && entry.requestId === requestId) {
          entry.status = "error";
          entry.error = error;
          entry.resolvedScope = null;
          entry.entrySnapshot = { status: "error", error };
          bumpAndNotify();
        }
        throw error;
      }
    );
    // Avoid unhandled rejection when only gate subscribers attach (no getPromise).
    void promise.catch((error: unknown) => {
      console.error("[i18n-react] namespace load failed:", error);
    });

    entries.set(key, {
      status: "pending",
      promise,
      resolvedScope: null,
      error: null,
      requestId,
      entrySnapshot: { status: "pending" },
    });
  }

  function getEntry(keyInput: LoadCoordinatorKey): LoadCoordinatorEntry<Scope> {
    const key = cacheKey(keyInput.engineRef, keyInput.partition, keyInput.namespaces);
    const entry = entries.get(key);
    if (entry === undefined) {
      return { status: "pending" };
    }
    return entry.entrySnapshot;
  }

  function getOrCreateDisplay(engineRef: unknown, namespaces: readonly string[]): DisplayCache {
    const id = gateId(engineRef, namespaces);
    let display = displayByGate.get(id);
    if (display === undefined) {
      display = {
        lastReady: null,
        displaySnapshot: null,
        displayKey: null,
        boundT: null,
        boundTKey: null,
      };
      displayByGate.set(id, display);
    }
    return display;
  }

  function bindT(
    display: DisplayCache,
    scope: ScopedScopeLike,
    locale: string,
    namespaces: readonly string[],
    scopeToken: string
  ): ScopedTranslateFn {
    const tKey = `${scopeToken}\0${locale}\0${namespaces.join("\0")}`;
    if (display.boundT !== null && display.boundTKey === tKey) {
      return display.boundT;
    }
    const t = createScopedT(scope, { namespaces, locale });
    display.boundT = t;
    display.boundTKey = tKey;
    return t;
  }

  function getDisplayEntry(
    keyInput: LoadCoordinatorKey,
    options: GetDisplayEntryOptions
  ): LoadDisplayEntry<Scope> {
    const key = cacheKey(keyInput.engineRef, keyInput.partition, keyInput.namespaces);
    const entry = entries.get(key);
    const display = getOrCreateDisplay(keyInput.engineRef, options.namespaces);
    const keepPrevious = options.keepPrevious !== false;

    const retry = () => {
      retryKey(keyInput);
    };

    let result: LoadDisplayEntry<Scope>;

    if (entry === undefined || entry.status === "pending") {
      const kept = keepPrevious ? display.lastReady : null;
      result = {
        status: "pending",
        display: kept as { scope: Scope & ScopedScopeLike; locale: string } | null,
        pendingLocale: kept ? options.locale : undefined,
        t: kept
          ? bindT(display, kept.scope, kept.locale, options.namespaces, `kept:${kept.locale}`)
          : null,
      } as LoadDisplayEntry<Scope>;
    } else if (entry.status === "resolved") {
      const scope = entry.resolvedScope as Scope & ScopedScopeLike;
      display.lastReady = { scope, locale: options.locale };
      result = {
        status: "ready",
        scope,
        locale: options.locale,
        t: bindT(display, scope, options.locale, options.namespaces, `ready:${key}`),
      } as LoadDisplayEntry<Scope>;
    } else {
      const kept = keepPrevious ? display.lastReady : null;
      result = {
        status: "error",
        error: entry.error,
        display: kept as { scope: Scope & ScopedScopeLike; locale: string } | null,
        pendingLocale: kept ? options.locale : undefined,
        t: kept
          ? bindT(display, kept.scope, kept.locale, options.namespaces, `kept:${kept.locale}`)
          : null,
        retry,
      } as LoadDisplayEntry<Scope>;
    }

    const displayKey = `${key}\0${result.status}\0${options.locale}\0${String(!!result.t)}`;
    if (display.displaySnapshot !== null && display.displayKey === displayKey) {
      return display.displaySnapshot as LoadDisplayEntry<Scope>;
    }
    display.displaySnapshot = result as LoadDisplayEntry<ScopedScopeLike>;
    display.displayKey = displayKey;
    return result;
  }

  function retryKey(keyInput: LoadCoordinatorKey): void {
    const key = cacheKey(keyInput.engineRef, keyInput.partition, keyInput.namespaces);
    if (!entries.has(key)) {
      return;
    }
    entries.delete(key);
    bumpAndNotify();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getPromise(): Promise<Scope> {
    if (lastKey === null) {
      throw new Error("createLoadCoordinator: call ensure()/request() before getPromise()");
    }
    const entry = entries.get(lastKey);
    if (entry === undefined) {
      throw new Error("createLoadCoordinator: call ensure()/request() before getPromise()");
    }
    return entry.promise;
  }

  function getResolvedScope(): Scope | null {
    if (lastKey === null) {
      return null;
    }
    const entry = entries.get(lastKey);
    return entry?.status === "resolved" ? entry.resolvedScope : null;
  }

  return {
    get revision() {
      return revision;
    },
    request: ensure,
    ensure,
    ensureSync,
    getEntry,
    getDisplayEntry,
    retry: retryKey,
    subscribe,
    getPromise,
    getResolvedScope,
  };
}
