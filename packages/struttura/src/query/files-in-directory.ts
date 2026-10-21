import type { DirDescriptor, DirRef } from "../architecture/artifacts";
import type { FileRenderContext } from "../apply/render-contents";
import type { DesiredArtifact } from "../inventory/derive-desired-inventory";
import type { FilesInOptions } from "./inventory-query";

export type FilesInDirectoryTarget = string | DirRef | DirDescriptor;

/**
 * Managed file artifacts that reference a directory on the render context.
 *
 * - `string` — artifact key on `ctx.artifacts` (must be a directory)
 * - `DirRef` — used directly
 * - `DirDescriptor` — matched by path to a bound directory on `ctx.artifacts`
 *
 * Throws if the target cannot be resolved to a directory artifact.
 */
export function filesInDirectory(
  ctx: FileRenderContext,
  directory: FilesInDirectoryTarget,
  options?: FilesInOptions
): readonly DesiredArtifact[] {
  return ctx.query.filesIn(resolveDirectory(ctx, directory), options);
}

function resolveDirectory(ctx: FileRenderContext, directory: FilesInDirectoryTarget): DirRef {
  if (typeof directory === "string") {
    const artifact = ctx.artifacts[directory];
    if (!artifact || artifact.kind !== "directory") {
      throw new Error(
        `Expected directory artifact "${directory}" on instance "${ctx.id}", got ${
          artifact?.kind ?? "undefined"
        }`
      );
    }
    return artifact;
  }

  if (directory.kind === "dir-descriptor") {
    const match = Object.values(ctx.artifacts).find(
      (artifact) => artifact.kind === "directory" && artifact.path === directory.path
    );
    if (!match || match.kind !== "directory") {
      throw new Error(
        `No directory artifact on instance "${ctx.id}" matches path "${directory.path}"`
      );
    }
    return match;
  }

  return directory;
}
