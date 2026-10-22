import type { FileContentFn } from "../structure/artifacts";
import type { FilesInOptions } from "../apply/files-in";
import type { DesiredArtifact } from "../inventory/derive-desired-inventory";

export type TsBarrelIndexOptions = FilesInOptions & {
  /** Content when `filesIn` returns no files. Defaults to `"export {};\n"`. */
  readonly empty?: string;
};

/**
 * Relative TypeScript module specifier from a directory path to a managed file
 * (strips `.ts` / `.tsx`; keeps other extensions such as `.md`).
 */
export function relativeTsModule(directoryPath: string, fileArtifact: DesiredArtifact): string {
  const prefix = directoryPath === "" ? "" : `${directoryPath}/`;
  if (!fileArtifact.path.startsWith(prefix) && directoryPath !== "") {
    throw new Error(`File "${fileArtifact.path}" is not under "${directoryPath}"`);
  }
  const relative =
    directoryPath === "" ? fileArtifact.path : fileArtifact.path.slice(prefix.length);
  const withoutExt = relative.replace(/\.tsx?$/, "");
  return withoutExt.startsWith(".") ? withoutExt : `./${withoutExt}`;
}

/**
 * Emit `export *` lines for managed files under `directoryPath`.
 * Empty file list yields an empty string (callers may substitute `export {};`).
 */
export function renderTsBarrel(directoryPath: string, files: readonly DesiredArtifact[]): string {
  if (files.length === 0) {
    return "";
  }
  return `${files.map((f) => `export * from "${relativeTsModule(directoryPath, f)}";`).join("\n")}\n`;
}

/**
 * Sync `FileContentFn` that lists managed files under {@link FileRenderContext.directory}
 * via `filesIn`, then emits a TypeScript barrel (`export *` / configurable empty fallback).
 */
export function tsBarrelIndex(options?: TsBarrelIndexOptions): FileContentFn {
  const empty = options?.empty ?? "export {};\n";
  const filesInOptions: FilesInOptions = {
    ...(options?.includeSelf === undefined ? {} : { includeSelf: options.includeSelf }),
    ...(options?.recursive === undefined ? {} : { recursive: options.recursive }),
    ...(options?.exclude === undefined ? {} : { exclude: options.exclude }),
  };
  return (ctx) => {
    const files = ctx.filesIn(ctx.directory, filesInOptions);
    const body = renderTsBarrel(ctx.directory.path, files);
    return body.length > 0 ? body : empty;
  };
}
