import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { vi, type Mock } from "vitest";

import type { DataResolutionPort, DataResolutionPull } from "../ports/data-resolution-port";
import { LaneResolveContentGraphEngine } from "../engines/lane-resolve-content-graph-engine";
import { createExpansionPolicyChain, type ExpansionPolicy } from "../ports/expansion-port";
import { BarrierResolveContentGraphEngine } from "../engines/barrier-resolve-content-graph-engine";
import type { ResourceLoader } from "../ports/resource-loader";
import { testAri } from "./test-fixtures.js";
import type {
  ContentRegistry,
  ResolveContentGraphInput,
  ResolveContentGraphOutput,
  ResolvedResourceRecord,
} from "../types";

export const page = testAri("page", "P");
export const hero = testAri("hero", "H");
export const menu = testAri("menu", "M");
export const footer = testAri("footer", "F");
export const asset = testAri("asset", "A");
export const missing = testAri("missing", "X");

export const pageGraphValues = new Map<string, unknown>([
  [
    page.toString(),
    {
      title: "Homepage",
      hero: { $ref: hero.toString() },
      menu: { $ref: menu.toString() },
      footer: { $ref: footer.toString() },
    },
  ],
  [hero.toString(), { image: { $ref: asset.toString() } }],
  [menu.toString(), { logo: { $ref: asset.toString() } }],
  [footer.toString(), { logo: { $ref: asset.toString() } }],
  [asset.toString(), { url: "https://cdn.example.com/logo.svg" }],
]);

export function createPageGraphPolicies(): ExpansionPolicy[] {
  return [
    {
      matches: ({ resource }) => resource.type === "page",
      expand: () => ({ resources: [hero, menu, footer] }),
    },
    {
      matches: ({ resource }) => resource.type === "hero",
      expand: () => ({ resources: [asset] }),
    },
    {
      matches: ({ resource }) => resource.type === "menu",
      expand: () => ({ resources: [asset], isIsland: true }),
    },
    {
      matches: ({ resource }) => resource.type === "footer",
      expand: () => ({ resources: [asset], isIsland: true }),
    },
    {
      matches: ({ resource }) => resource.type === "asset",
      expand: () => ({ resources: [] }),
    },
  ];
}

export type EngineKind = "barrier" | "lane";

export interface ContentGraphEngine {
  execute(input: ResolveContentGraphInput): Promise<ResolveContentGraphOutput>;
}

type AnyResolvedRecord = ResolvedResourceRecord<ContentRegistry>;

export interface SemanticHarness {
  readonly kind: EngineKind;
  readonly engine: ContentGraphEngine;
  readonly process: Mock<(pull: DataResolutionPull) => Promise<readonly AnyResolvedRecord[]>>;
  readonly takenBatches: ApplicationResourceIdentifier[][];
}

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function recordsFromStore(
  taken: readonly ApplicationResourceIdentifier[],
  store: ReadonlyMap<string, unknown>
): AnyResolvedRecord[] {
  const result: AnyResolvedRecord[] = [];
  for (const resource of taken) {
    const key = resource.toString();
    if (store.has(key)) {
      result.push({ resource, payload: store.get(key) });
    }
  }
  return result;
}

export function createStoreProcess(
  store: ReadonlyMap<string, unknown>,
  options: {
    takenBatches?: ApplicationResourceIdentifier[][];
    accept?: (resource: ApplicationResourceIdentifier) => boolean;
    takeLimit?: number;
  } = {}
): (pull: DataResolutionPull) => Promise<readonly AnyResolvedRecord[]> {
  const takenBatches = options.takenBatches;
  const accept = options.accept ?? (() => true);

  return async (pull) => {
    const taken = pull.take(accept, options.takeLimit);
    takenBatches?.push(taken);
    return recordsFromStore(taken, store);
  };
}

export function createSemanticHarness(
  kind: EngineKind,
  options: {
    store?: ReadonlyMap<string, unknown>;
    process?: (pull: DataResolutionPull) => Promise<readonly AnyResolvedRecord[]>;
    accept?: (resource: ApplicationResourceIdentifier) => boolean;
    takeLimit?: number;
    policies?: ExpansionPolicy[];
  } = {}
): SemanticHarness {
  const store = options.store ?? pageGraphValues;
  const accept = options.accept ?? (() => true);
  const takenBatches: ApplicationResourceIdentifier[][] = [];
  const processImpl =
    options.process ??
    createStoreProcess(store, {
      takenBatches,
      accept,
      ...(options.takeLimit !== undefined ? { takeLimit: options.takeLimit } : {}),
    });
  const process = vi.fn(processImpl);
  const expansion = createExpansionPolicyChain(options.policies ?? createPageGraphPolicies());

  if (kind === "barrier") {
    const dataPort: DataResolutionPort = { process };
    return {
      kind,
      engine: new BarrierResolveContentGraphEngine(dataPort, expansion),
      process,
      takenBatches,
    };
  }

  const loader: ResourceLoader = { accepts: accept, process };
  return {
    kind,
    engine: new LaneResolveContentGraphEngine([loader], expansion),
    process,
    takenBatches,
  };
}

/**
 * Loader that records batches and tracks peak in-flight process calls.
 * Optionally waits on a gate before returning store payloads.
 */
export function createControlledLoader(options: {
  label: string;
  accepts: (resource: ApplicationResourceIdentifier) => boolean;
  store: ReadonlyMap<string, unknown>;
  takeLimit?: number;
  /** When set, each process call awaits this before returning. */
  gate?: () => Promise<void>;
  onBatchStart?: (batch: readonly ApplicationResourceIdentifier[], inFlight: number) => void;
}): ResourceLoader & {
  readonly label: string;
  readonly takenBatches: ApplicationResourceIdentifier[][];
  readonly process: Mock<(pull: DataResolutionPull) => Promise<readonly AnyResolvedRecord[]>>;
  readonly inFlightPeak: { value: number };
  readonly currentlyInFlight: { value: number };
} {
  const takenBatches: ApplicationResourceIdentifier[][] = [];
  const currentlyInFlight = { value: 0 };
  const inFlightPeak = { value: 0 };

  const process = vi.fn(async (pull: DataResolutionPull) => {
    const taken = pull.take(() => true, options.takeLimit);
    takenBatches.push(taken);
    currentlyInFlight.value += 1;
    inFlightPeak.value = Math.max(inFlightPeak.value, currentlyInFlight.value);
    options.onBatchStart?.(taken, currentlyInFlight.value);

    try {
      if (options.gate !== undefined) {
        await options.gate();
      }
      return recordsFromStore(taken, options.store);
    } finally {
      currentlyInFlight.value -= 1;
    }
  });

  return {
    label: options.label,
    accepts: options.accepts,
    takenBatches,
    process,
    inFlightPeak,
    currentlyInFlight,
  };
}
