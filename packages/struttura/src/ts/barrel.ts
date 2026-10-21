import { file, type DirectoryRefInput, type FileDescriptor } from "../architecture/artifacts";
import type { FileRenderContext } from "../apply/render-contents";
import type { DesiredArtifact } from "../inventory/derive-desired-inventory";
import type { FilesInOptions } from "../query/inventory-query";
import { filesInDirectory, type FilesInDirectoryTarget } from "../query/files-in-directory";

export type TsBarrelIndexOptions = {
  /** Directory that owns the barrel and whose managed files are re-exported. */
  readonly directory: DirectoryRefInput;
  /** Defaults to `"index.ts"`. */
  readonly filename?: string;
  /** Defaults to `"sync"` (derived barrel). */
  readonly mode?: "sync" | "scaffold";
  /** Passed to {@link filesInDirectory} / {@link renderTsBarrel}. */
  readonly recursive?: boolean;
  readonly includeSelf?: boolean;
};

/**
 * Base-case TypeScript barrel file in `directory` (usually `index.ts`, sync).
 * Special layouts (index outside the listed dir) stay as `file` + {@link renderTsBarrel}.
 */
export function tsBarrelIndex(options: TsBarrelIndexOptions): FileDescriptor {
  const filename = options.filename ?? "index.ts";
  const mode = options.mode ?? "sync";
  const filesInOptions: FilesInOptions = {
    ...(options.recursive === undefined ? {} : { recursive: options.recursive }),
    ...(options.includeSelf === undefined ? {} : { includeSelf: options.includeSelf }),
  };
  return file({
    filename,
    directory: options.directory,
    mode,
    content: (ctx) => {
      const body = renderTsBarrel(ctx, options.directory, filesInOptions);
      return body.length > 0 ? body : "export {};\n";
    },
  });
}

/**
 * Relative TypeScript module specifier from a directory path to a managed file
 * (strips `.ts` / `.tsx`; keeps other extensions such as `.md`).
 */
export function relativeTsModule(directoryPath: string, fileArtifact: DesiredArtifact): string {
  const prefix = directoryPath === "" ? "" : `${directoryPath}/`;
  if (!fileArtifact.path.startsWith(prefix)) {
    throw new Error(`File "${fileArtifact.path}" is not under "${directoryPath}"`);
  }
  const relative = fileArtifact.path.slice(prefix.length);
  const withoutExt = relative.replace(/\.tsx?$/, "");
  return withoutExt.startsWith(".") ? withoutExt : `./${withoutExt}`;
}

/**
 * Sync barrel from a render context + directory (key, DirRef, or DirDescriptor).
 * Resolves files via {@link filesInDirectory}, then emits `export *` lines.
 */
export function renderTsBarrel(
  ctx: FileRenderContext,
  directory: FilesInDirectoryTarget,
  options?: FilesInOptions
): string;

/**
 * Sync barrel from an explicit directory path and file list (e.g. merging
 * several `filesInDirectory` results under a parent path).
 */
export function renderTsBarrel(directoryPath: string, files: readonly DesiredArtifact[]): string;

export function renderTsBarrel(
  ctxOrPath: FileRenderContext | string,
  directoryOrFiles: FilesInDirectoryTarget | readonly DesiredArtifact[],
  options?: FilesInOptions
): string {
  if (typeof ctxOrPath === "string") {
    return formatTsBarrel(ctxOrPath, directoryOrFiles as readonly DesiredArtifact[]);
  }

  const directory = directoryOrFiles as FilesInDirectoryTarget;
  const files = filesInDirectory(ctxOrPath, directory, options);
  const directoryPath = barrelBasePath(ctxOrPath, directory);
  return formatTsBarrel(directoryPath, files);
}

function formatTsBarrel(directoryPath: string, files: readonly DesiredArtifact[]): string {
  if (files.length === 0) {
    return "";
  }
  return `${files.map((f) => `export * from "${relativeTsModule(directoryPath, f)}";`).join("\n")}\n`;
}

function barrelBasePath(ctx: FileRenderContext, directory: FilesInDirectoryTarget): string {
  if (typeof directory === "string") {
    const artifact = ctx.artifacts[directory];
    if (!artifact || artifact.kind !== "directory") {
      throw new Error(
        `Expected directory artifact "${directory}" on instance "${ctx.id}", got ${
          artifact?.kind ?? "undefined"
        }`
      );
    }
    return artifact.path;
  }
  if (directory.kind === "dir-descriptor") {
    return directory.path;
  }
  return directory.path;
}
