/**
 * Manual (non-Suspense) i18n load gate: ensure + subscribe via the load
 * coordinator, then render fallback / keep-previous / error UI / throw.
 */
import {
  forwardRef,
  useSyncExternalStore,
  type ForwardedRef,
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
} from "react";
import type {
  LoadCoordinator,
  LoadCoordinatorRequest,
  LoadDisplayEntry,
  LoadPartition,
  ScopedScopeLike,
  ScopedTranslateFn,
} from "./types.js";

/** Inputs for {@link useNamespaceLoad}. */
export interface UseNamespaceLoadInput<Scope> {
  coordinator: LoadCoordinator<Scope>;
  engineRef: unknown;
  partition: LoadPartition;
  namespaces: readonly string[];
  locale: string;
  load: () => Promise<Scope>;
  tryResolveSync?: () => Scope | null;
  keepPrevious?: boolean;
}

/**
 * Starts (or reuses) a coordinator load and re-renders when that entry settles.
 * Client getSnapshot may kick `load()`; SSR getServerSnapshot only peeks sync
 * (hydrated `state`) and never starts a client fetch during prerender.
 */
export function useNamespaceLoad<Scope>(
  input: UseNamespaceLoadInput<Scope>
): LoadDisplayEntry<Scope> {
  const {
    coordinator,
    engineRef,
    partition,
    namespaces,
    locale,
    load,
    tryResolveSync,
    keepPrevious,
  } = input;

  const request: LoadCoordinatorRequest<Scope> = {
    engineRef,
    partition,
    namespaces,
    load,
    ...(tryResolveSync !== undefined ? { tryResolveSync } : {}),
  };

  const displayOptions = {
    locale,
    namespaces,
    ...(keepPrevious !== undefined ? { keepPrevious } : {}),
  };

  return useSyncExternalStore(
    coordinator.subscribe,
    () => {
      coordinator.ensure(request);
      return coordinator.getDisplayEntry({ engineRef, partition, namespaces }, displayOptions);
    },
    () => {
      coordinator.ensureSync(request);
      return coordinator.getDisplayEntry({ engineRef, partition, namespaces }, displayOptions);
    }
  );
}

/** Scoped `{ t, locale }` injected into gate children / HOC when ready (or kept). */
export interface I18nLoadGateValue {
  t: ScopedTranslateFn;
  locale: string;
  /** Set during keep-then-switch while a new partition is loading. */
  pendingLocale?: string;
  error?: unknown;
  retry?: () => void;
}

/** Load wiring from React context (coordinator, engine, partition, load). */
export interface I18nLoadArgs {
  coordinator: LoadCoordinator<ScopedScopeLike>;
  engineRef: unknown;
  partition: LoadPartition;
  locale: string;
  load: (namespaces: readonly string[]) => Promise<ScopedScopeLike>;
  tryResolveSync?: (namespaces: readonly string[]) => ScopedScopeLike | null;
}

export interface CreateI18nLoadGateOptions {
  /**
   * When true (default), keep last resolved `{ t, locale }` while a new
   * partition is pending instead of showing fallback.
   */
  keepPreviousOnPartitionChange?: boolean;
  /** Hook that resolves coordinator + load inputs from React context. */
  useLoadArgs: () => I18nLoadArgs;
}

export interface I18nGateProps {
  namespaces: readonly string[];
  /** Shown only while the load is pending (not on error). */
  fallback?: ReactNode;
  /**
   * When set, called for error with no keep-previous display.
   * Otherwise the load error is thrown for a React error boundary.
   */
  renderError?: (args: { error: unknown; retry: () => void }) => ReactNode;
  children: (value: I18nLoadGateValue) => ReactNode;
}

/** Pending UI for `withI18n` — static node or derived from own props. */
export type WithI18nFallback<P extends object> = ReactNode | ((props: P) => ReactNode);

export interface I18nHocOptions<P extends object = object> {
  namespaces: readonly string[];
  fallback?: WithI18nFallback<P>;
  renderError?: (args: { error: unknown; retry: () => void; props: P }) => ReactNode;
}

/** Render fn for `withI18n`: own props, i18n bag, optional forwarded ref. */
export type WithI18nRender<P extends object, R = never> = (
  props: P,
  i18n: I18nLoadGateValue,
  ref?: ForwardedRef<R>
) => ReactNode;

function resolveNamespaces(namespaces: readonly string[] | undefined): readonly string[] {
  if (namespaces === undefined || namespaces.length === 0) {
    throw new Error("withI18n / I18n: requires a non-empty namespaces list");
  }
  return namespaces;
}

function toThrownError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error("i18n namespace load failed");
}

function renderDisplayEntry(
  entry: LoadDisplayEntry<ScopedScopeLike>,
  options: {
    fallback?: ReactNode;
    renderError?: (args: { error: unknown; retry: () => void }) => ReactNode;
    children: (value: I18nLoadGateValue) => ReactNode;
  }
): ReactNode {
  if (entry.status === "ready") {
    return options.children({ t: entry.t, locale: entry.locale });
  }

  if (entry.status === "error" && entry.t === null) {
    if (options.renderError) {
      return options.renderError({ error: entry.error, retry: entry.retry! });
    }
    throw toThrownError(entry.error);
  }

  if (entry.t !== null && entry.display) {
    const value: I18nLoadGateValue = {
      t: entry.t,
      locale: entry.display.locale,
    };
    if (entry.pendingLocale !== undefined) {
      value.pendingLocale = entry.pendingLocale;
    }
    if (entry.status === "error") {
      value.error = entry.error;
      value.retry = entry.retry;
    }
    return options.children(value);
  }

  return options.fallback ?? null;
}

/**
 * Factory for generic `I18n` gate + `withI18n` HOC over the same Outer.
 * Codegen emits typed wrappers; tests use this directly.
 */
export function createI18nLoadGate(options: CreateI18nLoadGateOptions): {
  I18n: (props: I18nGateProps) => ReactNode;
  withI18n: <P extends object = object, R = never>(
    hocOptions: I18nHocOptions<P>,
    render: WithI18nRender<P, R>
  ) => ForwardRefExoticComponent<P & RefAttributes<R>>;
} {
  const { useLoadArgs } = options;
  const keepPrevious = options.keepPreviousOnPartitionChange !== false;

  function useGateEntry(namespaces: readonly string[]): LoadDisplayEntry<ScopedScopeLike> {
    const resolved = resolveNamespaces(namespaces);
    const args = useLoadArgs();
    return useNamespaceLoad({
      coordinator: args.coordinator,
      engineRef: args.engineRef,
      partition: args.partition,
      namespaces: resolved,
      locale: args.locale,
      load: () => args.load(resolved),
      ...(args.tryResolveSync !== undefined
        ? { tryResolveSync: () => args.tryResolveSync!(resolved) }
        : {}),
      keepPrevious,
    });
  }

  function I18n({ namespaces, fallback, renderError, children }: I18nGateProps): ReactNode {
    const entry = useGateEntry(namespaces);
    return renderDisplayEntry(entry, {
      ...(fallback !== undefined ? { fallback } : {}),
      ...(renderError !== undefined ? { renderError } : {}),
      children,
    });
  }

  function withI18n<P extends object = object, R = never>(
    hocOptions: I18nHocOptions<P>,
    render: WithI18nRender<P, R>
  ): ForwardRefExoticComponent<P & RefAttributes<R>> {
    const { fallback, renderError } = hocOptions;
    const Outer = forwardRef<R, P>(function I18nHocOuter(props, ref) {
      const entry = useGateEntry(hocOptions.namespaces);

      const needsFallback = entry.status === "pending" && entry.t === null;
      const resolvedFallback =
        !needsFallback || fallback === undefined
          ? undefined
          : typeof fallback === "function"
            ? fallback(props as P)
            : fallback;

      return renderDisplayEntry(entry, {
        ...(resolvedFallback !== undefined ? { fallback: resolvedFallback } : {}),
        ...(renderError !== undefined
          ? {
              renderError: ({ error, retry }) => renderError({ error, retry, props: props as P }),
            }
          : {}),
        children: (value) => render(props as P, value, ref),
      });
    });

    const displayName = render.name || "Component";
    Outer.displayName = `withI18n(${displayName})`;
    return Outer as ForwardRefExoticComponent<P & RefAttributes<R>>;
  }

  return { I18n, withI18n };
}
