/**
 * Builds the scoped `t` function used by providers and load gates.
 *
 * Takes a loaded `@xndrjs/i18n` scope and returns a capability-safe translator:
 * namespaces outside the provider list throw at runtime. Locale is always bound.
 */
import type { CreateScopedTOptions, ScopedScopeLike, ScopedTranslateFn } from "./types.js";

function assertNamespace(namespace: string, namespaces: readonly string[]): void {
  if (!namespaces.includes(namespace)) {
    throw new Error(
      `Namespace "${namespace}" is not loaded by this provider. Allowed: [${namespaces.join(", ")}]`
    );
  }
}

function resolveActiveScope(scope: ScopedScopeLike, locale: string): ScopedScopeLike {
  if (typeof scope.forLocale === "function" && scope.locale !== locale) {
    return scope.forLocale(locale);
  }
  return scope;
}

/**
 * Wraps a loaded scope `t` with namespace guards and locale binding.
 */
export function createScopedT(
  scope: ScopedScopeLike,
  options: CreateScopedTOptions
): ScopedTranslateFn {
  const activeScope = resolveActiveScope(scope, options.locale);
  const { namespaces } = options;

  return ((namespace: string, key: string, ...rest: unknown[]) => {
    assertNamespace(namespace, namespaces);
    return activeScope.t(namespace, key, ...rest);
  }) as ScopedTranslateFn;
}

/**
 * Curries a multi-namespace context `t(ns, key, …)` into a namespace-bound `t(key, …)`.
 * Used when composing gate values without introducing a separate hooks API.
 */
export function bindNamespaceTranslate(
  t: ScopedTranslateFn,
  namespace: string
): (key: string, params?: Record<string, unknown>) => string {
  return (key: string, params?: Record<string, unknown>) =>
    params === undefined ? t(namespace, key) : t(namespace, key, params);
}
