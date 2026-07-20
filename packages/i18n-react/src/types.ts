/**
 * Internal runtime types for `@xndrjs/i18n-react` implementation modules.
 */

/** Locale-bound multi-namespace `t(ns, key, …)`. */
export type ScopedTranslateFn = (
  namespace: string,
  key: string,
  params?: Record<string, unknown>
) => string;

/** Partition key for load deduplication — locale (or delivery area when custom). */
export type LoadPartition = string | undefined;

/** Key inputs for load deduplication. */
export interface LoadCoordinatorKey {
  engineRef: unknown;
  partition: LoadPartition;
  namespaces: readonly string[];
}

/** Request payload for {@link createLoadCoordinator.ensure}. */
export interface LoadCoordinatorRequest<Scope> extends LoadCoordinatorKey {
  load: () => Promise<Scope>;
  /**
   * Optional sync resolve for already-seeded resources. When it returns a scope,
   * the entry is marked resolved on the same snapshot (no pending → fallback flash).
   */
  tryResolveSync?: () => Scope | null;
}

/** Snapshot of a coordinator cache entry. */
export type LoadCoordinatorEntry<Scope> =
  | { status: "pending" }
  | { status: "resolved"; scope: Scope }
  | { status: "error"; error: unknown };

/** Display entry for gates — includes keep-previous and stable bound `t`. */
export type LoadDisplayEntry<Scope> =
  | {
      status: "pending";
      display: { scope: Scope; locale: string } | null;
      pendingLocale: string | undefined;
      t: ScopedTranslateFn | null;
    }
  | {
      status: "ready";
      scope: Scope;
      locale: string;
      pendingLocale?: undefined;
      t: ScopedTranslateFn;
    }
  | {
      status: "error";
      error: unknown;
      display: { scope: Scope; locale: string } | null;
      pendingLocale: string | undefined;
      t: ScopedTranslateFn | null;
      retry: () => void;
    };

/** Options for building a display entry (namespace-bound `t`). */
export interface GetDisplayEntryOptions {
  locale: string;
  namespaces: readonly string[];
  /** When false, do not keep previous scope across partition changes (default true). */
  keepPrevious?: boolean;
}

/** Mutable load coordinator returned by {@link createLoadCoordinator}. */
export interface LoadCoordinator<Scope> {
  readonly revision: number;
  /** @deprecated Prefer {@link ensure}. */
  request(input: LoadCoordinatorRequest<Scope>): void;
  /** Idempotent: start load if missing. Safe from client getSnapshot. */
  ensure(input: LoadCoordinatorRequest<Scope>): void;
  /**
   * Idempotent: resolve from {@link LoadCoordinatorRequest.tryResolveSync} only.
   * Never starts `load()` — use from SSR `getServerSnapshot`.
   */
  ensureSync(input: LoadCoordinatorRequest<Scope>): void;
  getEntry(key: LoadCoordinatorKey): LoadCoordinatorEntry<Scope>;
  getDisplayEntry(
    key: LoadCoordinatorKey,
    options: GetDisplayEntryOptions
  ): LoadDisplayEntry<Scope>;
  /** Evict entry so the next ensure() re-fetches. */
  retry(key: LoadCoordinatorKey): void;
  subscribe(listener: () => void): () => void;
  getPromise(): Promise<Scope>;
  getResolvedScope(): Scope | null;
}

/** Options for {@link createScopedT}. */
export interface CreateScopedTOptions {
  namespaces: readonly string[];
  locale: string;
}

/** Minimal scope shape used by {@link createScopedT}. */
export interface ScopedScopeLike {
  t: (...args: unknown[]) => string;
  forLocale?: (locale: string) => ScopedScopeLike;
  locale?: string;
}

/** Factory passed to {@link I18nRootProvider} — typically codegen `createI18n`. */
export type CreateI18nFactory = (
  // Project factories type options per loaderStrategy (fetch requires fetchImpl).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridge codegen-specific option shapes
  options?: any
  // Return is project-typed; runtime casts to {@link I18nHandleLike}.
) => unknown;

/** Minimal handle shape from `@xndrjs/i18n` createI18n(). */
export interface I18nHandleLike {
  load: (input: { namespaces: readonly string[]; locale: string }) => Promise<ScopedScopeLike>;
  peek: (input: { namespaces: readonly string[]; locale: string }) => ScopedScopeLike | null;
  serialize: () => {
    dictionary: unknown;
    resources: readonly (readonly [string, string])[];
  };
  getLoadState: () => {
    resources: readonly {
      namespace: string;
      partition: string;
      status: "pending" | "loaded" | "error";
      error?: unknown;
    }[];
  };
}

/** Single React context value for the lazy i18n tree. */
export interface I18nRootContextValue {
  handle: I18nHandleLike;
  coordinator: LoadCoordinator<ScopedScopeLike>;
  locale: string;
}
