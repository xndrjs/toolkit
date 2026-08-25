import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { IslandId, ResolutionStrategy, ResourceKey } from "../types";

export interface ResolutionStartEvent {
  root: ApplicationResourceIdentifier;
  strategy: ResolutionStrategy;
  sourceIds: readonly string[];
}

export interface ResolutionEndEvent {
  durationMs: number;
  resolvedCount: number;
  errorCount: number;
  promotedCount: number;
}

export interface ResourceBatchStartEvent {
  sourceId: string;
  batchNumber: number;
  /** Grouped exactly as handed to the source. */
  resourcesByFamily: Readonly<Record<string, readonly ApplicationResourceIdentifier[]>>;
  resourceCount: number;
}

export interface ResourceBatchEndEvent {
  sourceId: string;
  batchNumber: number;
  requestedCount: number;
  resolvedCount: number;
  durationMs: number;
}

export interface ResourceBatchErrorEvent {
  sourceId: string;
  batchNumber: number;
  requestedCount: number;
  durationMs: number;
  error: unknown;
}

export interface ResourceExpandEvent {
  resource: ApplicationResourceIdentifier;
  /** Effective island, which is the resource itself when it opens a new island. */
  islandId: IslandId;
  isIsland: boolean;
  children: readonly ApplicationResourceIdentifier[];
}

export interface BackingPromoteEvent {
  resource: ApplicationResourceIdentifier;
  islandIds: readonly IslandId[];
}

export interface MissingResourceEvent {
  resourceKey: ResourceKey;
  inheritedIslandIds: readonly IslandId[];
  message: string;
}

/**
 * Optional resolution hooks for tracing and metrics.
 *
 * Every callback is optional, and a callback that throws never affects
 * resolution — failures are swallowed on purpose so a logging bug cannot corrupt
 * a walk.
 */
export interface ResolutionObserver {
  onResolutionStart?(event: ResolutionStartEvent): void;
  onResolutionEnd?(event: ResolutionEndEvent): void;
  onBatchStart?(event: ResourceBatchStartEvent): void;
  onBatchEnd?(event: ResourceBatchEndEvent): void;
  onBatchError?(event: ResourceBatchErrorEvent): void;
  onExpand?(event: ResourceExpandEvent): void;
  onBackingPromote?(event: BackingPromoteEvent): void;
  onMissingResource?(event: MissingResourceEvent): void;
}

/**
 * Invokes one observer hook with the observer as receiver, building the event
 * only when a hook exists and ignoring observer-side failures.
 */
export function notifyObserver<K extends keyof ResolutionObserver>(
  observer: ResolutionObserver | undefined,
  hook: K,
  event: () => Parameters<NonNullable<ResolutionObserver[K]>>[0]
): void {
  const callback = observer?.[hook];
  if (callback === undefined) {
    return;
  }

  try {
    (callback as (payload: unknown) => void).call(observer, event());
  } catch {
    // Observers are diagnostics; their failures must not alter resolution.
  }
}
