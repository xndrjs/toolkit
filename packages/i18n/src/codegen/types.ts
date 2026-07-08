import type { SUPPORTED_IMPORT_EXTENSIONS } from "./constants.js";

export type ImportExtension = (typeof SUPPORTED_IMPORT_EXTENSIONS)[number];

export interface NamespaceEntry {
  namespace: string;
  filePath: string;
}

export type DictionaryJson = Record<string, Record<string, string>>;

export interface LoadOnInitResolution {
  loadOnInitSet: Set<string>;
  lazyEntries: NamespaceEntry[];
  hasLazy: boolean;
}
