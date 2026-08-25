import { benchNodeAri } from "./ari";
import {
  BENCH_ROOT_ID,
  DEFAULT_MAX_NODES,
  type BenchNodePayload,
  type BenchProductPayload,
  type GeneratedBenchGraph,
} from "./generate";

export type GeneratePagebuilderGraphInput = {
  /** Page root fan-out (modules on the page). */
  readonly modules: number;
  /** Max CMS nesting levels including the page root (typical 4–5). */
  readonly depth: number;
  /** Children per non-product section/container. */
  readonly arity: number;
  /**
   * Among siblings, every Nth node (index % stride === 0) terminates early as a
   * product module; others nest until `depth`. Lower stride → more early products
   * and stronger CMS∥integration overlap for lane.
   */
  readonly productStride: number;
  readonly maxNodes?: number;
};

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be an integer >= 1, got ${String(value)}`);
  }
}

function siblingIndex(id: string): number {
  const last = id.split("-").pop();
  const parsed = Number.parseInt(last ?? "", 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Cannot parse sibling index from id "${id}"`);
  }
  return parsed;
}

/** True when this CMS node should be a product leaf (no further CMS children). */
export function isPagebuilderProductLeaf(args: {
  readonly id: string;
  readonly level: number;
  readonly depth: number;
  readonly productStride: number;
}): boolean {
  const { id, level, depth, productStride } = args;
  if (id === BENCH_ROOT_ID) {
    return false;
  }
  if (level >= depth - 1) {
    return true;
  }
  return siblingIndex(id) % productStride === 0;
}

function nestableChildSlots(arity: number, productStride: number): number {
  let nestable = 0;
  for (let j = 0; j < arity; j += 1) {
    if (j % productStride !== 0) {
      nestable += 1;
    }
  }
  return nestable;
}

/**
 * Counts CMS nodes for a pagebuilder graph without allocating stores.
 * Returns `Number.POSITIVE_INFINITY` if the count is not a safe integer.
 */
export function expectedPagebuilderCmsNodeCount(input: {
  readonly modules: number;
  readonly depth: number;
  readonly arity: number;
  readonly productStride: number;
}): number {
  const { modules, depth, arity, productStride } = input;
  assertPositiveInteger("modules", modules);
  assertPositiveInteger("depth", depth);
  assertPositiveInteger("arity", arity);
  assertPositiveInteger("productStride", productStride);

  if (depth < 2) {
    throw new Error(`pagebuilder depth must be >= 2 (page + modules), got ${depth}`);
  }

  let total = 1 + modules;
  if (!Number.isSafeInteger(total)) {
    return Number.POSITIVE_INFINITY;
  }

  let continuing = 0;
  for (let i = 0; i < modules; i += 1) {
    if (!isPagebuilderProductLeaf({ id: `n-0-${i}`, level: 1, depth, productStride })) {
      continuing += 1;
    }
  }

  const nestablePerParent = nestableChildSlots(arity, productStride);

  for (let level = 2; level < depth; level += 1) {
    const levelSize = continuing * arity;
    total += levelSize;
    if (!Number.isSafeInteger(total)) {
      return Number.POSITIVE_INFINITY;
    }

    if (level >= depth - 1) {
      break;
    }

    continuing = continuing * nestablePerParent;
  }

  return total;
}

/**
 * Page-shaped graph: wide root fan-out, shallow nesting, product modules at mixed depths.
 *
 * Deterministic ids (`n-0`, `n-0-0`, …). Product leaves have empty `children` and are
 * expanded to `bench.product` by the shared expansion port.
 */
export function generatePagebuilderGraph(
  input: GeneratePagebuilderGraphInput
): GeneratedBenchGraph {
  const { modules, depth, arity, productStride } = input;
  const maxNodes = input.maxNodes ?? DEFAULT_MAX_NODES;

  assertPositiveInteger("modules", modules);
  assertPositiveInteger("depth", depth);
  assertPositiveInteger("arity", arity);
  assertPositiveInteger("productStride", productStride);
  assertPositiveInteger("maxNodes", maxNodes);

  if (depth < 2) {
    throw new Error(`pagebuilder depth must be >= 2 (page + modules), got ${depth}`);
  }

  const expected = expectedPagebuilderCmsNodeCount({ modules, depth, arity, productStride });
  if (!(expected <= maxNodes)) {
    throw new Error(
      `Pagebuilder graph would allocate ${
        Number.isFinite(expected) ? expected.toLocaleString("en-US") : "too many"
      } CMS nodes (modules=${modules}, depth=${depth}, arity=${arity}, productStride=${productStride}), ` +
        `which exceeds maxNodes=${maxNodes.toLocaleString("en-US")}. ` +
        `Lower --modules / --depth / --arity, or raise --max-nodes.`
    );
  }

  const cmsStore = new Map<string, BenchNodePayload>();
  const productCatalog = new Map<string, BenchProductPayload>();

  const pending: { id: string; level: number }[] = [{ id: BENCH_ROOT_ID, level: 0 }];
  let treeEdgeCount = 0;

  for (const { id, level } of pending) {
    const children: string[] = [];

    if (id === BENCH_ROOT_ID) {
      for (let childIndex = 0; childIndex < modules; childIndex += 1) {
        const childId = `${id}-${childIndex}`;
        children.push(childId);
        pending.push({ id: childId, level: level + 1 });
      }
      treeEdgeCount += children.length;
    } else if (!isPagebuilderProductLeaf({ id, level, depth, productStride })) {
      for (let childIndex = 0; childIndex < arity; childIndex += 1) {
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

  if (cmsStore.size !== expected) {
    throw new Error(
      `Pagebuilder CMS count mismatch: allocated ${cmsStore.size}, expected ${expected}.`
    );
  }

  const cmsNodeCount = cmsStore.size;
  const productCount = productCatalog.size;
  const edgeCount = treeEdgeCount + productCount;

  return {
    root: benchNodeAri({ id: BENCH_ROOT_ID }),
    rootId: BENCH_ROOT_ID,
    profile: "pagebuilder",
    depth,
    arity,
    modules,
    productStride,
    cmsStore,
    productCatalog,
    counts: {
      cmsNodeCount,
      productCount,
      edgeCount,
    },
  };
}
