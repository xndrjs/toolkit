import { performance } from "node:perf_hooks";

import {
  assertFullyDisposed,
  createStreamGraph,
  createUnaryGraph,
  expectedUnaryValue,
} from "./graph";
import type { StressCheck, StressConfig } from "./types";

async function timed(
  name: string,
  operations: number,
  run: () => Promise<void>
): Promise<StressCheck> {
  const startedAt = performance.now();
  await run();
  return { name, operations, durationMs: performance.now() - startedAt };
}

export async function runStressSuite(config: StressConfig): Promise<readonly StressCheck[]> {
  const checks: StressCheck[] = [];

  checks.push(
    await timed("repeated context lifecycle", config.cycles, async () => {
      const graph = createUnaryGraph(config.shape);
      try {
        for (let cycle = 0; cycle < config.cycles; cycle += 1) {
          await graph.root.withExecutionContext(async (surface) => {
            const result = await surface.run(cycle);
            if (!result.ok || result.value !== expectedUnaryValue(config.shape, cycle)) {
              throw new Error("Repeated lifecycle returned an unexpected result.");
            }
          });
        }
        assertFullyDisposed(graph, config.cycles);
      } finally {
        await graph.root.dispose();
      }
    })
  );

  checks.push(
    await timed("concurrent first materialization", config.concurrency, async () => {
      const graph = createUnaryGraph(config.shape);
      const context = graph.root.openExecutionContext();
      try {
        const results = await Promise.all(
          Array.from({ length: config.concurrency }, (_, index) => context.surface.run(index))
        );
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          if (!result?.ok || result.value !== expectedUnaryValue(config.shape, index)) {
            throw new Error("Concurrent materialization returned an unexpected result.");
          }
        }
      } finally {
        await context.dispose();
        assertFullyDisposed(graph, 1);
        await graph.root.dispose();
      }
    })
  );

  checks.push(
    await timed("early stream close", config.cycles, async () => {
      const graph = createStreamGraph(config.shape, 2);
      try {
        for (let cycle = 0; cycle < config.cycles; cycle += 1) {
          await graph.root.withExecutionContext(async (surface) => {
            for await (const result of surface.run(cycle)) {
              if (!result.ok || result.value !== expectedUnaryValue(config.shape, cycle)) {
                throw new Error("Early-close stream returned an unexpected result.");
              }
              break;
            }
          });
        }
        assertFullyDisposed(graph, config.cycles);
        if (graph.counters.streamsClosed !== config.cycles) {
          throw new Error("An early-close stream did not execute its finally block.");
        }
      } finally {
        await graph.root.dispose();
      }
    })
  );

  checks.push(
    await timed("concurrent root disposal with active streams", config.openContexts, async () => {
      const graph = createStreamGraph(config.shape, 2);
      const contexts = Array.from({ length: config.openContexts }, () =>
        graph.root.openExecutionContext()
      );
      const iterators = [];
      for (let index = 0; index < contexts.length; index += 1) {
        const iterator = contexts[index]?.surface.run(index)[Symbol.asyncIterator]();
        if (!iterator) throw new Error("Missing active stream iterator.");
        const first = await iterator.next();
        if (
          first.done ||
          !first.value.ok ||
          first.value.value !== expectedUnaryValue(config.shape, index)
        ) {
          throw new Error("Active stream setup returned an unexpected result.");
        }
        iterators.push(iterator);
      }
      await Promise.all([graph.root.dispose(), graph.root.dispose()]);
      assertFullyDisposed(graph, config.openContexts);
      if (graph.counters.streamsClosed !== config.openContexts) {
        throw new Error("Root disposal did not close every active stream.");
      }
      const tails = await Promise.all(iterators.map((iterator) => iterator.next()));
      if (tails.some((tail) => !tail.done)) {
        throw new Error("An iterator remained open after root disposal.");
      }
    })
  );

  return checks;
}
