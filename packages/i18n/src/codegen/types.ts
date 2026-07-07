export const SUPPORTED_IMPORT_EXTENSIONS = ["none", ".ts", ".js"] as const;
export type ImportExtension = (typeof SUPPORTED_IMPORT_EXTENSIONS)[number];

export interface CodegenConfig {
  dictionary?: string;
  namespaces?: Record<string, string>;
  defaultNamespace?: string;
  typesOutput: string;
  dictionaryOutput: string;
  instanceOutput: string;
  dictionarySchemaOutput?: string;
  loadOnInit?: string[];
  namespaceLoadersOutput?: string;
  /** Extension used in relative imports between generated modules. Default: "none" */
  importExtension?: ImportExtension;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName?: string;
  localeFallbackConstName?: string;
  localeFallback?: Record<string, string | null>;
  factoryName?: string;
}

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
