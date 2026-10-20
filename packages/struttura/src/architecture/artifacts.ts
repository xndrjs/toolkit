export type FileMode = "sync" | "scaffold";

export type RootRef = {
  readonly kind: "root";
  readonly path: "";
};

export type ArtifactDirRef = {
  readonly kind: "directory";
  readonly path: string;
  readonly instanceId: string;
  readonly artifactKey: string;
};

export type DirRef = RootRef | ArtifactDirRef;

export type FileRef = {
  readonly kind: "file";
  readonly path: string;
  readonly instanceId: string;
  readonly artifactKey: string;
  readonly mode: FileMode;
  readonly filename: string;
};

export type DirDescriptor = {
  readonly kind: "dir-descriptor";
  readonly path: string;
};

/** Invoked after desired inventory exists; prefer FileRenderContext (query.filesIn). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- render ctx typed in apply/render-contents
export type FileContentFn = (ctx: any) => string;

/** Accepted at call sites; file refs are rejected during inventory derivation. */
export type DirectoryRefInput = DirRef | DirDescriptor | FileRef;

export type FileDescriptor = {
  readonly kind: "file-descriptor";
  readonly filename: string;
  readonly directoryRef: DirectoryRefInput;
  readonly mode: FileMode;
  readonly content?: string | FileContentFn;
};

export type ArtifactDescriptor = DirDescriptor | FileDescriptor;

/** Special DirRef for the configured materialization root (ADR 0005). */
export const root: RootRef = Object.freeze({ kind: "root", path: "" });

export function dir(path: string): DirDescriptor {
  return Object.freeze({
    kind: "dir-descriptor",
    path: normalizeRelativePath(path),
  });
}

export function file(
  filename: string,
  directoryRef: DirectoryRefInput,
  mode: FileMode,
  content?: string | FileContentFn
): FileDescriptor {
  return Object.freeze({
    kind: "file-descriptor",
    filename,
    directoryRef,
    mode,
    ...(content === undefined ? {} : { content }),
  });
}

export function isDirRef(value: DirectoryRefInput): value is DirRef {
  return value.kind === "root" || value.kind === "directory";
}

export function isRootPath(path: string): boolean {
  const normalized = normalizeRelativePath(path);
  return normalized === "" || normalized === ".";
}

/**
 * Single-segment filename: non-empty, no separators, not `.` / `..`.
 * Allows `.gitkeep`, `page.model.ts`, `package.json`.
 */
export const FILENAME_PATTERN = /^(?!\.$)(?!\.\.$)[^/\\]+$/;

export function isValidFilename(filename: string): boolean {
  return FILENAME_PATTERN.test(filename);
}

export function normalizeRelativePath(raw: string): string {
  const withForward = raw.replaceAll("\\", "/");
  const trimmed = withForward.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === ".") {
    return "";
  }

  const segments = trimmed.split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (out.length === 0) {
        throw new PathEscapeError(raw);
      }
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

export function joinPath(directoryPath: string, filename: string): string {
  if (directoryPath === "" || directoryPath === ".") {
    return filename;
  }
  return `${directoryPath}/${filename}`;
}

export class PathEscapeError extends Error {
  constructor(public readonly path: string) {
    super(`Path escapes materialization root: ${path}`);
    this.name = "PathEscapeError";
  }
}
