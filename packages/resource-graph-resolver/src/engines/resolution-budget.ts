import type { AddressableResourceIdentifier } from "@xndrjs/addressable-resources";

import { ResourceGraphBudgetExceededError, ResourceGraphError } from "../errors";
import type {
  IslandId,
  ResolutionBudget,
  ResolutionBudgetKind,
  ResolutionBudgetOptions,
  ResolutionBudgetUsage,
} from "../types";

export const DEFAULT_RESOLUTION_BUDGET: Readonly<ResolutionBudget> = Object.freeze({
  maxNodes: 10_000,
  maxEdges: 50_000,
  maxBatches: 1_000,
  maxDurationMs: 30_000,
});

type BudgetExceededCallback = (error: ResourceGraphBudgetExceededError) => void;

const MAX_TIMEOUT_MS = 2_147_483_647;

function positiveInteger(name: ResolutionBudgetKind, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ResourceGraphError(`Resolution budget ${name} must be a positive safe integer`);
  }
  if (name === "maxDurationMs" && value > MAX_TIMEOUT_MS) {
    throw new ResourceGraphError(
      `Resolution budget maxDurationMs must not exceed ${MAX_TIMEOUT_MS}`
    );
  }
  return value;
}

export function normalizeResolutionBudget(
  options: ResolutionBudgetOptions | undefined
): Readonly<ResolutionBudget> {
  return Object.freeze({
    maxNodes: positiveInteger("maxNodes", options?.maxNodes ?? DEFAULT_RESOLUTION_BUDGET.maxNodes),
    maxEdges: positiveInteger("maxEdges", options?.maxEdges ?? DEFAULT_RESOLUTION_BUDGET.maxEdges),
    maxBatches: positiveInteger(
      "maxBatches",
      options?.maxBatches ?? DEFAULT_RESOLUTION_BUDGET.maxBatches
    ),
    maxDurationMs: positiveInteger(
      "maxDurationMs",
      options?.maxDurationMs ?? DEFAULT_RESOLUTION_BUDGET.maxDurationMs
    ),
  });
}

/** Per-resolution counter and deadline owner. */
export class ResolutionBudgetTracker {
  private readonly nodeKeys = new Set<string>();
  private readonly edgeKeys = new Set<string>();
  private batches = 0;
  private exceededError: ResourceGraphBudgetExceededError | undefined;

  constructor(
    readonly limits: Readonly<ResolutionBudget>,
    private readonly startedAt: number,
    private readonly onExceeded: BudgetExceededCallback
  ) {}

  discoverNode(resource: AddressableResourceIdentifier): void {
    this.assertDuration();
    const key = resource.toString();
    if (this.nodeKeys.has(key)) return;
    this.nodeKeys.add(key);
    this.assertLimit("maxNodes", this.nodeKeys.size);
  }

  discoverExpansion(
    source: AddressableResourceIdentifier,
    islandId: IslandId,
    target: AddressableResourceIdentifier
  ): void {
    this.discoverEdge(
      `expand\u0000${islandId}\u0000${source.toString()}\u0000${target.toString()}`
    );
    this.discoverNode(target);
  }

  discoverRedirect(
    source: AddressableResourceIdentifier,
    target: AddressableResourceIdentifier
  ): void {
    this.discoverEdge(`redirect\u0000${source.toString()}\u0000${target.toString()}`);
    this.discoverNode(target);
  }

  startBatch(): void {
    this.assertDuration();
    const next = this.batches + 1;
    this.assertLimit("maxBatches", next);
    this.batches = next;
  }

  assertDuration(now = Date.now()): void {
    if (this.exceededError !== undefined) throw this.exceededError;
    const durationMs = Math.max(0, now - this.startedAt);
    if (durationMs >= this.limits.maxDurationMs) {
      throw this.exceed("maxDurationMs", durationMs, now);
    }
  }

  exceedDuration(now = Date.now()): ResourceGraphBudgetExceededError {
    return this.exceed("maxDurationMs", Math.max(0, now - this.startedAt), now);
  }

  usage(now = Date.now()): ResolutionBudgetUsage {
    return {
      nodes: this.nodeKeys.size,
      edges: this.edgeKeys.size,
      batches: this.batches,
      durationMs: Math.max(0, now - this.startedAt),
    };
  }

  private discoverEdge(key: string): void {
    this.assertDuration();
    if (this.edgeKeys.has(key)) return;
    this.edgeKeys.add(key);
    this.assertLimit("maxEdges", this.edgeKeys.size);
  }

  private assertLimit(budget: ResolutionBudgetKind, actual: number): void {
    if (actual > this.limits[budget]) {
      throw this.exceed(budget, actual);
    }
  }

  private exceed(
    budget: ResolutionBudgetKind,
    actual: number,
    now = Date.now()
  ): ResourceGraphBudgetExceededError {
    if (this.exceededError !== undefined) return this.exceededError;
    const error = new ResourceGraphBudgetExceededError(
      budget,
      this.limits[budget],
      actual,
      this.usage(now)
    );
    this.exceededError = error;
    this.onExceeded(error);
    return error;
  }
}
