import path from "node:path";

export const GENERATED_FILE_BANNER = "// Automatically generated code. Do not edit manually.\n";

export type ImportExtension = "none" | ".ts" | ".js";

export function importExtensionSuffix(importExtension: ImportExtension): string {
  return importExtension === "none" ? "" : importExtension;
}

export function toModuleBasename(filePath: string): string {
  return path.basename(filePath).replace(/\.tsx?$/, "");
}

export function toRelativeModuleImport(
  moduleBasename: string,
  importExtension: ImportExtension
): string {
  return `./${moduleBasename}${importExtensionSuffix(importExtension)}`;
}

export interface ReactBindingsFileOptions {
  factoryName: string;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName: string;
  instanceImport: string;
  typesImport: string;
  /** When `"fetch"`, {@link I18nRoot} requires `fetchImpl`. */
  loaderStrategy?: "import" | "fetch";
}

/** When `Ns` is `[]`, reject every `t(...)` call so refactoring can clear namespaces and re-add only what is used. */
function formatMultiScopedTType(
  schemaTypeName: string,
  paramsTypeName: string,
  localeTypeName: string
): string {
  const emptyBranch = `(namespace: never, key: never, ...args: never[]) => string`;
  return (
    `type ScopedT<Ns extends readonly AppNamespace[]> = Ns extends readonly []\n` +
    `  ? ${emptyBranch}\n` +
    `  : I18nScopeMultiForLocale<\n` +
    `  SchemaForNamespaces<${schemaTypeName}, Ns>,\n` +
    `  ParamsForNamespaces<${schemaTypeName}, ${paramsTypeName}, Ns>,\n` +
    `  ${localeTypeName},\n` +
    `  ${localeTypeName}\n` +
    `>["t"];\n\n`
  );
}

function formatI18nRoot(options: {
  factoryName: string;
  localeTypeName: string;
  loaderStrategy: "import" | "fetch";
}): string {
  const { factoryName, localeTypeName, loaderStrategy } = options;

  if (loaderStrategy === "fetch") {
    return (
      `export function I18nRoot({\n` +
      `  locale,\n` +
      `  children,\n` +
      `  state,\n` +
      `  dictionary,\n` +
      `  fetchImpl,\n` +
      `}: {\n` +
      `  locale: ${localeTypeName};\n` +
      `  children: ReactNode;\n` +
      `  state?: I18nCreateInput | undefined;\n` +
      `  dictionary?: Record<string, unknown> | undefined;\n` +
      `  fetchImpl: FetchArtifact;\n` +
      `}) {\n` +
      `  return (\n` +
      `    <I18nRootProvider\n` +
      `      createI18n={${factoryName}}\n` +
      `      locale={locale}\n` +
      `      fetchImpl={fetchImpl}\n` +
      `      {...(state !== undefined ? { state } : {})}\n` +
      `      {...(dictionary !== undefined ? { dictionary } : {})}\n` +
      `    >\n` +
      `      {children}\n` +
      `    </I18nRootProvider>\n` +
      `  );\n` +
      `}\n`
    );
  }

  return (
    `export function I18nRoot({\n` +
    `  locale,\n` +
    `  children,\n` +
    `  state,\n` +
    `  dictionary,\n` +
    `}: {\n` +
    `  locale: ${localeTypeName};\n` +
    `  children: ReactNode;\n` +
    `  state?: I18nCreateInput | undefined;\n` +
    `  dictionary?: Record<string, unknown> | undefined;\n` +
    `}) {\n` +
    `  return (\n` +
    `    <I18nRootProvider\n` +
    `      createI18n={${factoryName}}\n` +
    `      locale={locale}\n` +
    `      {...(state !== undefined ? { state } : {})}\n` +
    `      {...(dictionary !== undefined ? { dictionary } : {})}\n` +
    `    >\n` +
    `      {children}\n` +
    `    </I18nRootProvider>\n` +
    `  );\n` +
    `}\n`
  );
}

/**
 * Emits typed root + withI18n / I18n for split-by-locale or custom delivery.
 * Every namespace loads through the handle + namespaceLoaders.
 * Partition→area mapping for custom delivery is injected into the handle by core codegen.
 */
export function formatReactBindingsFile(options: ReactBindingsFileOptions): string {
  const {
    factoryName,
    localeTypeName,
    instanceImport,
    paramsTypeName,
    schemaTypeName,
    typesImport,
    loaderStrategy = "import",
  } = options;

  const createInputImport =
    loaderStrategy === "fetch"
      ? `import type { FetchArtifact, I18nCreateInput } from "@xndrjs/i18n";\n`
      : `import type { I18nCreateInput } from "@xndrjs/i18n";\n`;

  return (
    `${GENERATED_FILE_BANNER}` +
    `"use client";\n\n` +
    `import {\n` +
    `  type ForwardedRef,\n` +
    `  type ForwardRefExoticComponent,\n` +
    `  type ReactNode,\n` +
    `  type RefAttributes,\n` +
    `} from "react";\n` +
    `import {\n` +
    `  createI18nLoadGate,\n` +
    `  I18nRootProvider,\n` +
    `  useI18nRootContext,\n` +
    `} from "@xndrjs/i18n-react";\n` +
    createInputImport +
    `import type {\n` +
    `  I18nScopeMultiForLocale,\n` +
    `  ParamsForNamespaces,\n` +
    `  SchemaForNamespaces,\n` +
    `} from "@xndrjs/i18n";\n` +
    `import { ${factoryName} } from "${instanceImport}";\n` +
    `import type { ${paramsTypeName}, ${schemaTypeName}, ${localeTypeName} } from "${typesImport}";\n` +
    `\n` +
    `export function useI18nRoot(): ReturnType<typeof ${factoryName}> {\n` +
    `  return useI18nRootContext().handle as ReturnType<typeof ${factoryName}>;\n` +
    `}\n\n` +
    `type AppNamespace = keyof ${schemaTypeName} & string;\n\n` +
    formatMultiScopedTType(schemaTypeName, paramsTypeName, localeTypeName) +
    `type I18nInjected<Ns extends readonly AppNamespace[]> = {\n` +
    `  t: ScopedT<Ns>;\n` +
    `  locale: ${localeTypeName};\n` +
    `  pendingLocale?: ${localeTypeName};\n` +
    `  error?: unknown;\n` +
    `  retry?: () => void;\n` +
    `};\n` +
    `export type I18nProps<Ns extends readonly AppNamespace[]> = I18nInjected<Ns>;\n\n` +
    `export type WithI18nFallback<P extends object> = ReactNode | ((props: P) => ReactNode);\n\n` +
    `const gate = createI18nLoadGate({\n` +
    `  useLoadArgs: () => {\n` +
    `    const root = useI18nRootContext();\n` +
    `    const { handle, coordinator, locale } = root;\n` +
    `    return {\n` +
    `      coordinator,\n` +
    `      engineRef: handle,\n` +
    `      partition: locale,\n` +
    `      locale,\n` +
    `      load: (namespaces: readonly string[]) =>\n` +
    `        handle.load({\n` +
    `          namespaces: namespaces as [AppNamespace, ...AppNamespace[]],\n` +
    `          locale,\n` +
    `        }),\n` +
    `      tryResolveSync: (namespaces: readonly string[]) =>\n` +
    `        handle.peek({\n` +
    `          namespaces: namespaces as [AppNamespace, ...AppNamespace[]],\n` +
    `          locale,\n` +
    `        }),\n` +
    `    };\n` +
    `  },\n` +
    `});\n\n` +
    `export function withI18n<\n` +
    `  P extends object = object,\n` +
    `  R = never,\n` +
    `  const Ns extends readonly AppNamespace[] = readonly AppNamespace[],\n` +
    `>(\n` +
    `  options: {\n` +
    `    namespaces: Ns;\n` +
    `    fallback?: WithI18nFallback<P>;\n` +
    `    renderError?: (args: { error: unknown; retry: () => void; props: P }) => ReactNode;\n` +
    `  },\n` +
    `  render: (props: P, i18n: I18nProps<Ns>, ref?: ForwardedRef<R>) => ReactNode\n` +
    `): ForwardRefExoticComponent<P & RefAttributes<R>> {\n` +
    `  return gate.withI18n(options, render as never) as ForwardRefExoticComponent<\n` +
    `    P & RefAttributes<R>\n` +
    `  >;\n` +
    `}\n\n` +
    `export function I18n<\n` +
    `  const Ns extends readonly AppNamespace[],\n` +
    `>(props: {\n` +
    `  namespaces: Ns;\n` +
    `  fallback?: ReactNode;\n` +
    `  renderError?: (args: { error: unknown; retry: () => void }) => ReactNode;\n` +
    `  children: (value: I18nProps<Ns>) => ReactNode;\n` +
    `}) {\n` +
    `  return gate.I18n(props as never);\n` +
    `}\n\n` +
    formatI18nRoot({ factoryName, localeTypeName, loaderStrategy })
  );
}
