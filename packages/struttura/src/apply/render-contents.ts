import type { FileContentFn, FileDescriptor } from "../architecture/artifacts";
import type { DesiredInventory } from "../inventory/derive-desired-inventory";
import type { Population, RegisteredInstance } from "../population/create-population";
import { createInventoryQuery, type InventoryQuery } from "../query/inventory-query";
import { artifactIdentity } from "./manifest";

export type FileRenderContext = {
  readonly name: string;
  readonly id: string;
  readonly artifacts: RegisteredInstance["artifacts"];
  readonly query: InventoryQuery;
} & Record<string, unknown>;

/**
 * Render file contents after desired inventory exists (ADR 0001 phase 5).
 * Content fns receive `query` so sync barrels can use `filesIn` (ADR 0004).
 */
export function renderFileContents(
  population: Population,
  inventory: DesiredInventory
): Map<string, string> {
  const contents = new Map<string, string>();

  for (const instance of population.instances) {
    const baseCtx: Record<string, unknown> = {
      name: instance.name,
      id: instance.id,
      artifacts: instance.artifacts,
      ...instance.dependencies,
    };
    const descriptors = instance.construct.buildArtifacts(
      baseCtx as Parameters<typeof instance.construct.buildArtifacts>[0]
    );

    for (const [artifactKey, descriptor] of Object.entries(descriptors)) {
      if (descriptor.kind !== "file-descriptor") {
        continue;
      }
      contents.set(
        artifactIdentity({ instanceId: instance.id, artifactKey }),
        resolveContent(descriptor, instance, inventory, artifactKey, baseCtx)
      );
    }
  }

  return contents;
}

function resolveContent(
  descriptor: FileDescriptor,
  instance: RegisteredInstance,
  inventory: DesiredInventory,
  artifactKey: string,
  baseCtx: Record<string, unknown>
): string {
  if (descriptor.content === undefined) {
    return "";
  }
  if (typeof descriptor.content === "string") {
    return descriptor.content;
  }
  const fn = descriptor.content as FileContentFn;
  const ctx: FileRenderContext = {
    ...baseCtx,
    name: instance.name,
    id: instance.id,
    artifacts: instance.artifacts,
    query: createInventoryQuery(inventory, { instanceId: instance.id, artifactKey }),
  };
  return fn(ctx);
}
