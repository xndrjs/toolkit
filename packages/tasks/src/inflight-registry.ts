/**
 * Holds in-flight promises keyed by {@link inflightDedup} symbols.
 * Pass your own registry to scope coalescing (tests, isolation); otherwise the package default is used.
 */
export type InflightRegistry = Map<symbol, Promise<unknown>>;

export function createInflightRegistry(): InflightRegistry {
  return new Map();
}

/** @internal — process-wide default when `registry` is omitted from {@link Task.inflightDedup}. */
export const defaultInflightRegistry: InflightRegistry = new Map();
