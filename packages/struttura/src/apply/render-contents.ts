import type { DirRef, FileContentFn, FileDescriptor } from "../structure/artifacts";
import type { DesiredArtifact, DesiredInventory } from "../inventory/derive-desired-inventory";
import type { Population, RegisteredInstance } from "../population/create-population";
import { directoryRefForFile, filesIn as listFilesIn, type FilesInOptions } from "./files-in";
import { artifactIdentity } from "./manifest";

export type { FilesInOptions } from "./files-in";

/**
 * Context for lazy file content functions (ADR 0001 phase 5).
 * Sync content may list managed files via {@link FileRenderContext.filesIn} (ADR 0014).
 */
export type FileRenderContext = {
  readonly name: string;
  readonly id: string;
  readonly artifacts: RegisteredInstance["artifacts"];
  /** DirRef of the directory that owns the file being rendered. */
  readonly directory: DirRef;
  /**
   * Managed file artifacts under `dir` from the Desired inventory.
   * Identity match by default; path subtree when `recursive` is true.
   */
  filesIn(dir: DirRef, options?: FilesInOptions): readonly DesiredArtifact[];
} & Record<string, unknown>;

/**
 * Render file contents after desired inventory exists (ADR 0001 phase 5).
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

  const fileArtifact = inventory.artifacts.find(
    (artifact) =>
      artifact.kind === "file" &&
      artifact.instanceId === instance.id &&
      artifact.artifactKey === artifactKey
  );
  if (!fileArtifact) {
    throw new Error(
      `Missing desired file artifact ${instance.id}/${artifactKey} while rendering content`
    );
  }

  const self = { instanceId: instance.id, artifactKey };
  const directory = directoryRefForFile(fileArtifact, inventory);
  const fn = descriptor.content as FileContentFn;
  const ctx: FileRenderContext = {
    ...baseCtx,
    name: instance.name,
    id: instance.id,
    artifacts: instance.artifacts,
    directory,
    filesIn(dir, options) {
      return listFilesIn(inventory, dir, self, options);
    },
  };
  return fn(ctx);
}
