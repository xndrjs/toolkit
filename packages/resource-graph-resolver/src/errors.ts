import type { IslandId, ResourceKey } from "./types";

const MAX_LISTED_KEYS = 5;

function summarizeKeys(resourceKeys: readonly ResourceKey[]): string {
  if (resourceKeys.length <= MAX_LISTED_KEYS) {
    return resourceKeys.join(", ");
  }

  const listed = resourceKeys.slice(0, MAX_LISTED_KEYS).join(", ");
  return `${listed}, and ${resourceKeys.length - MAX_LISTED_KEYS} more`;
}

/** Base class for every error this package throws. */
export class ResourceGraphError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ResourceGraphError";
  }
}

/**
 * Typed resolution failure: throwable from data sources (`instanceof ResolutionError`),
 * collectable into {@link import("./types").ResolveResourceGraphOutput.errors}, and
 * usable as a projected alias value under `on failure set error`.
 *
 * Datasources typically throw with `code` + `message` (+ optional `originalError`);
 * the resolver fills `resourceKey` / `inheritedIslandIds` when attributing the failure.
 */
export class ResolutionError extends ResourceGraphError {
  readonly code: number | string;
  readonly originalError?: unknown;
  readonly resourceKey?: ResourceKey;
  readonly inheritedIslandIds: readonly IslandId[];

  constructor(
    code: number | string,
    message: string,
    originalError?: unknown,
    options?: {
      resourceKey?: ResourceKey;
      inheritedIslandIds?: readonly IslandId[];
    }
  ) {
    super(message, originalError === undefined ? undefined : { cause: originalError });
    this.name = "ResolutionError";
    this.code = code;
    this.originalError = originalError;
    this.resourceKey = options?.resourceKey;
    this.inheritedIslandIds = options?.inheritedIslandIds ?? [];
  }

  /**
   * Returns a copy with resolver attribution. Preserves `code`, `message`, and
   * `originalError` from the source error (e.g. a datasource rejection).
   */
  withAttribution(
    resourceKey: ResourceKey,
    inheritedIslandIds: readonly IslandId[] = []
  ): ResolutionError {
    return new ResolutionError(this.code, this.message, this.originalError, {
      resourceKey,
      inheritedIslandIds,
    });
  }
}

/** Thrown when {@link import("./types").ResolveResourceGraphInput.signal} aborts resolution. */
export class ResourceGraphAbortedError extends ResourceGraphError {
  constructor(message = "Resource graph resolution was aborted", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ResourceGraphAbortedError";
  }
}

/**
 * A strategy redirect would create an identity cycle.
 *
 * Redirect cycles are structural graph errors and always abort resolution;
 * per-edge missing-resource policies do not soften them.
 */
export class ResourceRedirectCycleError extends ResourceGraphError {
  readonly resourceKeys: readonly ResourceKey[];

  constructor(resourceKeys: readonly ResourceKey[]) {
    super(`Resource redirect cycle detected: ${resourceKeys.join(" -> ")}`);
    this.name = "ResourceRedirectCycleError";
    this.resourceKeys = [...resourceKeys];
  }
}

/**
 * A resource was requested but never resolved: either a source returned
 * `undefined` for its batch slot, or a source rejected while loading it.
 *
 * Thrown when the discovering edge's `onFailure` is `"throw"` (the default);
 * under `"setError"` it is collected into
 * {@link import("./types").ResolveResourceGraphOutput.errors}.
 */
export class MissingResourceError extends ResourceGraphError {
  readonly resourceKey: ResourceKey;
  readonly inheritedIslandIds: readonly IslandId[];

  constructor(
    resourceKey: ResourceKey,
    inheritedIslandIds: readonly IslandId[] = [],
    options?: { cause?: unknown; message?: string }
  ) {
    super(options?.message ?? `Unable to resolve ${resourceKey}`, { cause: options?.cause });
    this.name = "MissingResourceError";
    this.resourceKey = resourceKey;
    this.inheritedIslandIds = inheritedIslandIds;
  }
}

/**
 * No configured data source declares a family matching this ARI, so the resolver has
 * nowhere to route it. Almost always a wiring mistake rather than missing data.
 */
export class NoDataSourceError extends ResourceGraphError {
  readonly resourceKey: ResourceKey;

  constructor(resourceKey: ResourceKey) {
    super(`No data source declares a family matching ${resourceKey}`);
    this.name = "NoDataSourceError";
    this.resourceKey = resourceKey;
  }
}

/** A data source's `load` rejected. `cause` carries the original rejection. */
export class ResourceLoadFailedError extends ResourceGraphError {
  readonly sourceId: string;
  readonly resourceKeys: readonly ResourceKey[];

  constructor(
    sourceId: string,
    resourceKeys: readonly ResourceKey[],
    options?: { cause?: unknown }
  ) {
    super(
      `Data source "${sourceId}" failed to load ${resourceKeys.length} resource(s): ${summarizeKeys(resourceKeys)}`,
      options
    );
    this.name = "ResourceLoadFailedError";
    this.sourceId = sourceId;
    this.resourceKeys = resourceKeys;
  }
}

/**
 * A data source's `load` returned a result whose length does not match the batch.
 * Positional contract: `results[i]` must correspond to `batch[i]`.
 */
export class ResourceBatchLengthError extends ResourceGraphError {
  readonly sourceId: string;
  readonly requestedCount: number;
  readonly returnedCount: number;

  constructor(sourceId: string, requestedCount: number, returnedCount: number) {
    super(
      `Data source "${sourceId}" returned ${returnedCount} payload slot(s) for a batch of ${requestedCount}`
    );
    this.name = "ResourceBatchLengthError";
    this.sourceId = sourceId;
    this.requestedCount = requestedCount;
    this.returnedCount = returnedCount;
  }
}
