import { benchNodeAri, type BenchNodeResource } from "./ari";

/**
 * Default CMS node cap (pagebuilder-scale benches stay well under this).
 * Raise via `--max-nodes` for stress trees (e.g. depth 10 × arity 3 ≈ 29k CMS).
 */
export const DEFAULT_MAX_NODES = 10_000;

export const BENCH_ROOT_ID = "n-0";

export type GraphProfile = "tree" | "pagebuilder";

export type BenchNodePayload = {
  readonly children: readonly string[];
};

export type BenchProductPayload = {
  readonly sku: string;
};

/** ContentRegistry for the bench app (CMS nodes + integration products). */
export type BenchContentRegistry = {
  "bench.node": BenchNodePayload;
  "bench.product": BenchProductPayload;
};

export type GenerateBenchGraphInput = {
  readonly depth: number;
  readonly arity: number;
  /** Fail if expected CMS nodes exceed this (default {@link DEFAULT_MAX_NODES}). */
  readonly maxNodes?: number;
};

export type BenchGraphCounts = {
  readonly cmsNodeCount: number;
  readonly productCount: number;
  /** CMS→CMS tree edges plus CMS-leaf→product edges. */
  readonly edgeCount: number;
};

export type GeneratedBenchGraph = {
  readonly root: BenchNodeResource;
  readonly rootId: typeof BENCH_ROOT_ID;
  readonly profile: GraphProfile;
  /** Max CMS depth (tree: full height; pagebuilder: page nesting cap). */
  readonly depth: number;
  /** Tree arity / pagebuilder section branch factor. */
  readonly arity: number;
  /** Page root fan-out; `0` when `profile === "tree"`. */
  readonly modules: number;
  /** Early-product stride; `0` when `profile === "tree"`. */
  readonly productStride: number;
  readonly cmsStore: ReadonlyMap<string, BenchNodePayload>;
  readonly productCatalog: ReadonlyMap<string, BenchProductPayload>;
  readonly counts: BenchGraphCounts;
};

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be an integer >= 1, got ${String(value)}`);
  }
}

/**
 * CMS node count for a full regular tree of `depth` levels and `arity` children
 * per internal node: `(A^D - 1) / (A - 1)` when `A > 1`, else `D` when `A = 1`.
 *
 * Returns `Number.POSITIVE_INFINITY` when the count is not a safe integer
 * (caller should treat that as exceeding any finite `maxNodes`).
 */
export function expectedCmsNodeCount(depth: number, arity: number): number {
  assertPositiveInteger("depth", depth);
  assertPositiveInteger("arity", arity);

  if (arity === 1) {
    return depth;
  }

  let total = 0;
  let levelSize = 1;
  for (let level = 0; level < depth; level++) {
    total += levelSize;
    if (!Number.isSafeInteger(total)) {
      return Number.POSITIVE_INFINITY;
    }
    if (level < depth - 1) {
      const next = levelSize * arity;
      if (!Number.isSafeInteger(next)) {
        return Number.POSITIVE_INFINITY;
      }
      levelSize = next;
    }
  }

  return total;
}

/**
 * Builds an in-memory CMS tree plus one product per leaf.
 *
 * Naming is deterministic (`n-0`, `n-0-0`, …) so runs are reproducible without RNG.
 * Expansion never uses islands: leaves expand to products via the shared expansion port.
 */
export function generateBenchGraph(input: GenerateBenchGraphInput): GeneratedBenchGraph {
  const { depth, arity } = input;
  const maxNodes = input.maxNodes ?? DEFAULT_MAX_NODES;

  assertPositiveInteger("depth", depth);
  assertPositiveInteger("arity", arity);
  assertPositiveInteger("maxNodes", maxNodes);

  const expected = expectedCmsNodeCount(depth, arity);
  if (!(expected <= maxNodes)) {
    throw new Error(
      `Bench graph would allocate ${
        Number.isFinite(expected) ? expected.toLocaleString("en-US") : "too many"
      } CMS nodes (depth=${depth}, arity=${arity}), which exceeds maxNodes=${maxNodes.toLocaleString("en-US")}. ` +
        `Lower --arity or --depth, or raise --max-nodes.`
    );
  }

  const cmsStore = new Map<string, BenchNodePayload>();
  const productCatalog = new Map<string, BenchProductPayload>();

  const pending: { id: string; level: number }[] = [{ id: BENCH_ROOT_ID, level: 0 }];
  let treeEdgeCount = 0;

  for (const { id, level } of pending) {
    const children: string[] = [];

    if (level < depth - 1) {
      for (let childIndex = 0; childIndex < arity; childIndex++) {
        const childId = `${id}-${childIndex}`;
        children.push(childId);
        pending.push({ id: childId, level: level + 1 });
      }
      treeEdgeCount += children.length;
    } else {
      productCatalog.set(id, { sku: id });
    }

    cmsStore.set(id, { children });
  }

  const cmsNodeCount = cmsStore.size;
  const productCount = productCatalog.size;
  const edgeCount = treeEdgeCount + productCount;

  return {
    root: benchNodeAri({ id: BENCH_ROOT_ID }),
    rootId: BENCH_ROOT_ID,
    profile: "tree",
    depth,
    arity,
    modules: 0,
    productStride: 0,
    cmsStore,
    productCatalog,
    counts: {
      cmsNodeCount,
      productCount,
      edgeCount,
    },
  };
}
