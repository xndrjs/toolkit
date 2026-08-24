import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { DataResolutionPort, DataResolutionPull } from "../ports/data-resolution-port";
import type { ExpansionPort } from "../ports/expansion-port";
import { GraphResolutionSession, type GraphWalkRef } from "./graph-resolution-session";
import type {
  ContentRegistry,
  ResolveContentGraphInput,
  ResolveContentGraphOutput,
  ResourceKey,
} from "../types";

/**
 * Resolves a content resource graph from a root ARI using frontier pulls,
 * island ownership, and configurable missing-resource handling.
 *
 * Intended as a reusable engine inside project-specific application use cases.
 * Supply a {@link ContentRegistry} so resolved values are typed by ARI `type`.
 */
export class ResolveContentGraphEngine<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  constructor(
    private readonly dataResolutionPort: DataResolutionPort<R>,
    private readonly expansionPort: ExpansionPort<R, TExecutionContext>
  ) {}

  async execute(
    input: ResolveContentGraphInput<TExecutionContext>
  ): Promise<ResolveContentGraphOutput<R>> {
    const session = new GraphResolutionSession(input, this.expansionPort);

    session.assertNotAborted();

    const rootRef: GraphWalkRef = {
      resource: input.root,
      inheritedIslandId: input.root.toString(),
    };
    session.rememberWaiter(rootRef);
    const queue: GraphWalkRef[] = [rootRef];

    while (queue.length > 0) {
      session.assertNotAborted();

      const frontier = queue.splice(0);
      const taken: GraphWalkRef[] = [];
      const takenKeys = new Set<ResourceKey>();

      session.promoteBackingHits(frontier);

      const needsResolve = frontier.some((item) => session.isUnresolved(item.resource));

      if (needsResolve) {
        session.assertNotAborted();

        const pull: DataResolutionPull = {
          signal: session.signal,
          take: (accept: (resource: ApplicationResourceIdentifier) => boolean, limit?: number) => {
            const batch: ApplicationResourceIdentifier[] = [];
            const max = limit === undefined ? Number.POSITIVE_INFINITY : limit;
            if (max <= 0) {
              return batch;
            }

            const remaining: GraphWalkRef[] = [];
            for (const item of frontier) {
              const key = item.resource.toString();
              const canTake =
                batch.length < max &&
                accept(item.resource) &&
                session.isUnresolved(item.resource) &&
                !takenKeys.has(key);

              if (canTake) {
                taken.push(item);
                takenKeys.add(key);
                session.markInFlight(item.resource);
                batch.push(item.resource);
              } else {
                remaining.push(item);
              }
            }

            frontier.length = 0;
            frontier.push(...remaining);
            return batch;
          },
        };

        const resolved = await this.dataResolutionPort.process(pull);

        session.assertNotAborted();

        const resolvedByKey = session.commitRecords(resolved);

        for (const item of taken) {
          if (resolvedByKey.has(item.resource.toString())) {
            session.settle(item.resource);
            continue;
          }

          session.throwIfMissingTaken(item);
        }

        // Port accepted nothing while unresolved work remains — not the same as
        // deferral after a non-empty take (those leftovers are re-queued below).
        if (taken.length === 0) {
          session.failUnhandledIfEmptyTake(frontier);
        }
      }

      for (const item of taken) {
        if (!session.contentMap.has(item.resource)) {
          session.registerMissing(item);
          continue;
        }
        queue.push(...session.expand(item));
      }

      for (const item of frontier) {
        if (session.contentMap.has(item.resource)) {
          queue.push(...session.expand(item));
        } else if (session.hasFailure(item.resource)) {
          // Duplicate queue entry for an already-failed resource — aggregate islands.
          session.registerMissing(item);
        } else {
          // Deferred by the port (not pulled this round) — try again after expand.
          queue.push(item);
        }
      }
    }

    session.assertNotAborted();
    return session.toOutput();
  }
}
