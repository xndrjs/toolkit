import type { FileContentFn, FileDescriptor } from "../architecture/artifacts";
import type { DesiredInventory } from "../inventory/derive-desired-inventory";
import type { Population, RegisteredInstance } from "../population/create-population";
import { artifactIdentity } from "./manifest";

/**
 * Context for lazy file content functions (ADR 0001 phase 5).
 * Inventory query / barrel helpers are not part of the public authoring surface.
 */
export type FileRenderContext = {
  readonly name: string;
  readonly id: string;
  readonly artifacts: RegisteredInstance["artifacts"];
} & Record<string, unknown>;

/**
 * Render file contents after desired inventory exists (ADR 0001 phase 5).
 */
export function renderFileContents(
  population: Population,
  _inventory: DesiredInventory
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
        resolveContent(descriptor, instance, baseCtx)
      );
    }
  }

  return contents;
}

function resolveContent(
  descriptor: FileDescriptor,
  instance: RegisteredInstance,
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
  };
  return fn(ctx);
}
