import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import { vi, type Mock } from "vitest";

import { createResourceGraphResolver } from "../engines/resource-graph-resolver";
import { createExpansionPolicyChain, type ExpansionPolicy } from "../ports/expansion-port";
import { createIslandPolicyChain, type IslandPolicy } from "../ports/island-port";
import type { GraphResolutionStrategy } from "../strategy/create-graph-resolution-strategy";
import type { ExpansionPort } from "../ports/expansion-port";
import type { IslandPort } from "../ports/island-port";
import type { ResourceFamilyMap, ResourceLoadContext, DataSource } from "../ports/data-source";
import { assetAri, footerAri, heroAri, menuAri, pageAri, productAri } from "./test-fixtures";
import type {
  ContentRegistry,
  SchedulingMode,
  ResolveResourceGraphOutput,
  ResolvedResourceRecord,
} from "../types";

export const page = pageAri({ id: "P" });
export const hero = heroAri({ id: "H" });
export const menu = menuAri({ id: "M" });
export const footer = footerAri({ id: "F" });
export const asset = assetAri({ id: "A" });
export const product = productAri({ id: "PR" });

/** page -> hero/menu/footer; hero/menu/footer -> asset. Menu and footer are islands. */
export const pageGraphValues: ReadonlyMap<string, unknown> = new Map<string, unknown>([
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

export function graphStrategy<R extends ContentRegistry, TExecutionContext>(
  expansion: ExpansionPort<R, TExecutionContext>,
  islands: IslandPort<R, TExecutionContext>
): GraphResolutionStrategy<R, TExecutionContext> {
  return { expansion, islands };
}

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
      expand: () => ({ resources: [asset] }),
    },
    {
      matches: ({ resource }) => resource.type === "footer",
      expand: () => ({ resources: [asset] }),
    },
  ];
}

export function createPageGraphIslandPolicies(): IslandPolicy[] {
  return [
    {
      matches: ({ resource }) => resource.type === "menu",
      resolve: () => ({ startIsland: true }),
    },
    {
      matches: ({ resource }) => resource.type === "footer",
      resolve: () => ({ startIsland: true }),
    },
  ];
}

export const pageGraphFamilies: ResourceFamilyMap = {
  page: pageAri,
  hero: heroAri,
  menu: menuAri,
  footer: footerAri,
  asset: assetAri,
};

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });

  return { promise, resolve, reject };
}

export function recordsFromStore(
  resources: readonly ApplicationResourceIdentifier[],
  store: ReadonlyMap<string, unknown>
): ResolvedResourceRecord<ContentRegistry>[] {
  const records: ResolvedResourceRecord<ContentRegistry>[] = [];
  for (const resource of resources) {
    const key = resource.toString();
    if (store.has(key)) {
      records.push({ resource, payload: store.get(key) });
    }
  }

  return records;
}

export interface StoreSourceOptions {
  readonly id?: string;
  readonly families: ResourceFamilyMap;
  readonly store?: ReadonlyMap<string, unknown>;
  readonly batchSize?: Readonly<Record<string, number>>;
  readonly concurrency?: number;
  /** Awaited before returning records; use to control completion ordering. */
  readonly gate?: () => Promise<void>;
  /** Simulated latency, so lane and barrier schedule differently. */
  readonly delayMs?: number;
  /** Omitted from results even when present in the store. */
  readonly omit?: readonly ApplicationResourceIdentifier[];
}

export interface StoreSource extends DataSource {
  readonly batches: ApplicationResourceIdentifier[][];
  readonly load: Mock<DataSource["load"]>;
  readonly inFlightPeak: { value: number };
}

/** A source backed by an in-memory store, recording every batch it receives. */
export function createStoreSource(options: StoreSourceOptions): StoreSource {
  const store = options.store ?? pageGraphValues;
  const omitted = new Set((options.omit ?? []).map((resource) => resource.toString()));
  const batches: ApplicationResourceIdentifier[][] = [];
  const inFlightPeak = { value: 0 };
  let inFlight = 0;

  const load = vi.fn(
    async (
      batch: Readonly<Record<string, readonly ApplicationResourceIdentifier[]>>,
      _context: ResourceLoadContext
    ) => {
      const requested: ApplicationResourceIdentifier[] = [];
      for (const familyKey of Object.keys(batch)) {
        for (const resource of batch[familyKey] ?? []) {
          requested.push(resource);
        }
      }
      batches.push(requested);

      inFlight += 1;
      inFlightPeak.value = Math.max(inFlightPeak.value, inFlight);

      try {
        if (options.delayMs !== undefined) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, options.delayMs);
          });
        }

        if (options.gate !== undefined) {
          await options.gate();
        }

        return recordsFromStore(
          requested.filter((resource) => !omitted.has(resource.toString())),
          store
        );
      } finally {
        inFlight -= 1;
      }
    }
  );

  return {
    id: options.id ?? "store",
    families: options.families,
    batchSize: options.batchSize ?? {},
    concurrency: Math.max(1, options.concurrency ?? 1),
    load,
    batches,
    inFlightPeak,
  };
}

/** Resolves the shared page graph through one scheduling mode with a single store source. */
export async function resolvePageGraph(
  schedulingMode: SchedulingMode,
  options: {
    source?: StoreSource;
    sources?: readonly DataSource[];
    policies?: ExpansionPolicy[];
    islandPolicies?: IslandPolicy[];
    missingResourceMode?: "throw" | "collect";
    backingResources?: ReadonlyMap<string, unknown>;
    signal?: AbortSignal;
  } = {}
): Promise<ResolveResourceGraphOutput<ContentRegistry>> {
  const sources = options.sources ?? [
    options.source ?? createStoreSource({ families: pageGraphFamilies }),
  ];

  const resolver = createResourceGraphResolver({
    sources,
    strategy: graphStrategy(
      createExpansionPolicyChain(options.policies ?? createPageGraphPolicies()),
      createIslandPolicyChain(options.islandPolicies ?? createPageGraphIslandPolicies())
    ),
    schedulingMode,
  });

  return resolver.resolve({
    root: page,
    executionContext: {},
    missingResourceMode: options.missingResourceMode ?? "throw",
    ...(options.backingResources !== undefined
      ? { backingResources: options.backingResources }
      : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
}
