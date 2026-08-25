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

/** Thrown when {@link import("./types").ResolveResourceGraphInput.signal} aborts resolution. */
export class ResourceGraphAbortedError extends ResourceGraphError {
  constructor(message = "Resource graph resolution was aborted", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ResourceGraphAbortedError";
  }
}

/**
 * A resource was requested but never resolved: either a source omitted it from
 * its result, or a source rejected while loading it.
 *
 * Thrown when `missingResourceMode` is `"throw"`; otherwise collected into
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
 * No configured source declares a family matching this ARI, so the resolver has
 * nowhere to route it. Almost always a wiring mistake rather than missing data.
 */
export class NoResourceSourceError extends ResourceGraphError {
  readonly resourceKey: ResourceKey;

  constructor(resourceKey: ResourceKey) {
    super(`No resource source declares a family matching ${resourceKey}`);
    this.name = "NoResourceSourceError";
    this.resourceKey = resourceKey;
  }
}

/** A source's `load` rejected. `cause` carries the original rejection. */
export class ResourceLoadFailedError extends ResourceGraphError {
  readonly sourceId: string;
  readonly resourceKeys: readonly ResourceKey[];

  constructor(
    sourceId: string,
    resourceKeys: readonly ResourceKey[],
    options?: { cause?: unknown }
  ) {
    super(
      `Resource source "${sourceId}" failed to load ${resourceKeys.length} resource(s): ${summarizeKeys(resourceKeys)}`,
      options
    );
    this.name = "ResourceLoadFailedError";
    this.sourceId = sourceId;
    this.resourceKeys = resourceKeys;
  }
}
