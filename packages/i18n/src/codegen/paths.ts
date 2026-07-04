import path from "node:path";

export const GENERATED_FILE_BANNER = "// Automatically generated code. Do not edit manually.\n";

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error(message);
}

export function toImportPath(fromFile: string, toFile: string): string {
  const relative = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, "/");
  const withoutExt = relative.replace(/\.json$/, "");
  return withoutExt.startsWith(".") ? withoutExt : `./${withoutExt}`;
}

export function toModuleBasename(filePath: string): string {
  return path.basename(filePath).replace(/\.ts$/, "");
}

export function toImportIdentifier(namespace: string): string {
  const safe = namespace.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (/^[0-9]/.test(safe)) {
    return `ns_${safe}`;
  }
  return `${safe}Ns`;
}
