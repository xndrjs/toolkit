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
