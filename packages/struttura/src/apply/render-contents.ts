import type { FileContentFn, FileDescriptor } from "../architecture/artifacts";
import type { Population, RegisteredInstance } from "../population/create-population";
import { artifactIdentity } from "./manifest";

/**
 * Render file contents after desired inventory exists (ADR 0001 phase 5).
 * Queries are not available yet (ticket 04); content fns receive the instance context.
 */
export function renderFileContents(population: Population): Map<string, string> {
  const contents = new Map<string, string>();

  for (const instance of population.instances) {
    const ctx: Record<string, unknown> = {
      name: instance.name,
      id: instance.id,
      artifacts: instance.artifacts,
      ...instance.dependencies,
    };
    const descriptors = instance.construct.buildArtifacts(
      ctx as Parameters<typeof instance.construct.buildArtifacts>[0]
    );

    for (const [artifactKey, descriptor] of Object.entries(descriptors)) {
      if (descriptor.kind !== "file-descriptor") {
        continue;
      }
      contents.set(
        artifactIdentity({ instanceId: instance.id, artifactKey }),
        resolveContent(descriptor, instance, ctx)
      );
    }
  }

  return contents;
}

function resolveContent(
  descriptor: FileDescriptor,
  instance: RegisteredInstance,
  ctx: Record<string, unknown>
): string {
  if (descriptor.content === undefined) {
    return "";
  }
  if (typeof descriptor.content === "string") {
    return descriptor.content;
  }
  const fn = descriptor.content as FileContentFn;
  return fn({ ...ctx, name: instance.name, id: instance.id });
}
