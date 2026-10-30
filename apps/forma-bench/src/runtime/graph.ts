import { boundary, compose, ok, type Result } from "@xndrjs/forma";

import type {
  DynamicCompositionRoot,
  GraphShape,
  ProviderCounters,
  RuntimeGraph,
  StreamSurface,
  UnarySurface,
} from "./types";

function assertValidShape(shape: GraphShape): void {
  if (!Number.isInteger(shape.arity) || shape.arity <= 1) {
    throw new Error("Runtime graph arity must be an integer greater than one.");
  }
  if (!Number.isInteger(shape.depth) || shape.depth <= 0) {
    throw new Error("Runtime graph depth must be a positive integer.");
  }
}

export function providerCountForShape(shape: GraphShape): number {
  assertValidShape(shape);
  let total = 0;
  for (let level = 0; level <= shape.depth; level += 1) {
    total += shape.arity ** level;
  }
  return total;
}

export function expectedUnaryValue(shape: GraphShape, input: number): number {
  return shape.arity ** shape.depth * (input + 1);
}

function createCounters(): ProviderCounters {
  return { created: 0, disposed: 0, active: 0, calls: 0, streamsClosed: 0 };
}

function registerMaterialization(
  counters: ProviderCounters,
  lifetime: { onDispose(cleanup: () => void): void }
): void {
  counters.created += 1;
  counters.active += 1;
  lifetime.onDispose(() => {
    counters.disposed += 1;
    counters.active -= 1;
  });
}

function successfulValue(result: Result<number, never>): number {
  if (!result.ok) {
    throw new Error("A never-error benchmark operation returned Err.");
  }
  return result.value;
}

type DynamicUnaryOperation = (input: number) => Promise<Result<number, never>>;

type DynamicProviderBuilder = {
  using(deps: Readonly<Record<string, unknown>>): {
    with(
      factory: (context: {
        readonly deps: Readonly<Record<string, DynamicUnaryOperation>>;
        readonly lifetime: { onDispose(cleanup: () => void): void };
      }) => Promise<DynamicUnaryOperation>
    ): unknown;
  };
};

/**
 * Runtime matrices are intentionally data-driven, while provider `using` records and
 * `compose` are deliberately optimized for statically named records and precise tuples.
 * The casts are confined to this boundary: every Boundary, Intent, and Provider that
 * passes through it is still created by the public API.
 */
const composeDynamic = compose as unknown as <Surface>(
  options: unknown
) => DynamicCompositionRoot<Surface>;

function createUnaryParts(shape: GraphShape, counters: ProviderCounters) {
  assertValidShape(shape);
  const RuntimeBench = boundary(`runtime-bench-a${shape.arity}-d${shape.depth}`);
  const intentLevels = Array.from({ length: shape.depth + 1 }, (_, level) =>
    Array.from({ length: shape.arity ** level }, (_, index) =>
      RuntimeBench.intent(`node-l${level}-n${index}`).contract<number, number, never>()
    )
  );
  const providerLevels: unknown[][] = Array.from({ length: shape.depth + 1 }, () => []);

  const leafIntents = intentLevels[shape.depth];
  if (!leafIntents) throw new Error("Runtime graph has no leaf level.");
  providerLevels[shape.depth] = leafIntents.map((intent) =>
    intent.provide.perContext().with(async ({ lifetime }) => {
      await Promise.resolve();
      registerMaterialization(counters, lifetime);
      return async (input) => {
        counters.calls += 1;
        return ok(input + 1);
      };
    })
  );

  for (let level = shape.depth - 1; level >= 0; level -= 1) {
    const intents = intentLevels[level];
    const childIntents = intentLevels[level + 1];
    if (!intents || !childIntents) throw new Error("Invalid runtime graph level.");

    providerLevels[level] = intents.map((intent, index) => {
      const children = Object.fromEntries(
        Array.from({ length: shape.arity }, (_, childIndex) => {
          const child = childIntents[index * shape.arity + childIndex];
          if (!child) throw new Error("Runtime graph is not balanced.");
          return [`child${childIndex}`, child];
        })
      );

      const builder = intent.provide as unknown as DynamicProviderBuilder;
      return builder.using(children).with(async ({ deps, lifetime }) => {
        await Promise.resolve();
        registerMaterialization(counters, lifetime);
        return async (input) => {
          counters.calls += 1;
          const results = await Promise.all(
            Object.values(deps).map((operation) => operation(input))
          );
          return ok(results.reduce((total, result) => total + successfulValue(result), 0));
        };
      });
    });
  }

  const rootIntent = intentLevels[0]?.[0];
  const rootProvider = providerLevels[0]?.[0];
  if (!rootIntent || !rootProvider) throw new Error("Runtime graph has no root.");

  return {
    RuntimeBench,
    rootIntent,
    rootProvider,
    providers: providerLevels.flat(),
  };
}

export function createUnaryGraphDefinition(shape: GraphShape): {
  readonly compose: () => RuntimeGraph<UnarySurface>;
  readonly counters: ProviderCounters;
} {
  const counters = createCounters();
  const { RuntimeBench, rootProvider, providers } = createUnaryParts(shape, counters);
  const providerCount = providerCountForShape(shape);

  return {
    counters,
    compose() {
      const root = composeDynamic<UnarySurface>({
        entryBoundaries: [RuntimeBench],
        surface: { run: rootProvider },
        wiring: providers.slice(1),
      });
      const plan = root.describePlan();
      if (plan.providers.length !== providerCount) {
        throw new Error(
          `Expected ${providerCount} Providers in the plan; received ${plan.providers.length}.`
        );
      }

      return { root, counters, providerCount };
    },
  };
}

export function createUnaryGraph(shape: GraphShape): RuntimeGraph<UnarySurface> {
  return createUnaryGraphDefinition(shape).compose();
}

export function createStreamGraph(
  shape: GraphShape,
  streamItems: number
): RuntimeGraph<StreamSurface> {
  const counters = createCounters();
  const { RuntimeBench, rootIntent, providers } = createUnaryParts(shape, counters);

  const Stream = RuntimeBench.stream("stream").contract<number, number, never>();
  const StreamProvider = Stream.provide
    .using({ previous: rootIntent })
    .with(async ({ deps, lifetime }) => {
      await Promise.resolve();
      registerMaterialization(counters, lifetime);
      return async function* (input, invocation) {
        try {
          for (let index = 0; index < streamItems; index += 1) {
            invocation.signal.throwIfAborted();
            counters.calls += 1;
            const previous = await deps.previous(input + index);
            yield ok(successfulValue(previous));
          }
        } finally {
          counters.streamsClosed += 1;
        }
      };
    });

  const providerCount = providerCountForShape(shape) + 1;
  const root = composeDynamic<StreamSurface>({
    entryBoundaries: [RuntimeBench],
    surface: { run: StreamProvider },
    wiring: providers,
  });
  if (root.describePlan().providers.length !== providerCount) {
    throw new Error("Unexpected stream graph plan size.");
  }

  return { root, counters, providerCount };
}

export function assertFullyDisposed(graph: RuntimeGraph<unknown>, expectedContexts: number): void {
  const expected = graph.providerCount * expectedContexts;
  if (graph.counters.created !== expected) {
    throw new Error(`Expected ${expected} materializations; received ${graph.counters.created}.`);
  }
  if (graph.counters.disposed !== expected || graph.counters.active !== 0) {
    throw new Error(
      `Lifecycle leak: created=${graph.counters.created}, disposed=${graph.counters.disposed}, active=${graph.counters.active}.`
    );
  }
}
