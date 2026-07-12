import { formatLocaleDeliveryAreaBlock, type DeliveryArtifactsMap } from "../delivery-artifacts.js";
import { formatLocaleFallbackBlock } from "../locale-fallback.js";
import { GENERATED_FILE_BANNER } from "../paths.js";
import type { NamespaceEntry } from "../types.js";

/**
 * Emits the generated `i18n-types.generated.ts` module: schema, params, locale/area
 * unions, fallback constants, and lazy-load type aliases.
 */
export function formatLazyTypesBlock(
  loadOnInitSet: Set<string>,
  lazyEntries: NamespaceEntry[],
  schemaTypeName: string
): string {
  const loadOnInitUnion =
    loadOnInitSet.size > 0
      ? [...loadOnInitSet]
          .sort()
          .map((namespace) => `'${namespace}'`)
          .join(" | ")
      : "never";
  const lazyUnion = lazyEntries.map((entry) => `'${entry.namespace}'`).join(" | ");

  return (
    `export type LoadOnInitNamespace = ${loadOnInitUnion};\n` +
    `export type LazyNamespace = ${lazyUnion};\n` +
    `export type InitialSchema = Pick<${schemaTypeName}, LoadOnInitNamespace>;\n\n`
  );
}

export function formatLocaleTemplateType(localeTypeName: string, hasLocaleUnion: boolean): string {
  if (!hasLocaleUnion) {
    return "Partial<Record<string, string>>";
  }
  return `Partial<Record<${localeTypeName}, string>>`;
}

export interface TypesFileOptions {
  isSingle: boolean;
  entries: NamespaceEntry[];
  projectRoot: string;
  typesOutputPath: string;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName: string;
  localeFallbackConstName: string;
  localeFallbackTypeName: string;
  localeFallback?: Record<string, string | null> | undefined;
  paramsByNamespace: Record<string, Record<string, string>>;
  requestLocaleUnion: string;
  deliveryAreaTypeName?: string;
  deliveryAreaUnion?: string;
  deliveryArtifacts?: DeliveryArtifactsMap;
  localeDeliveryAreaConstName?: string;
  hasLazy: boolean;
  loadOnInitSet: Set<string>;
  lazyEntries: NamespaceEntry[];
}

export function formatTypesFile(options: TypesFileOptions): string {
  const {
    isSingle,
    entries,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    localeFallbackTypeName,
    localeFallback,
    paramsByNamespace,
    requestLocaleUnion,
    deliveryAreaTypeName,
    deliveryAreaUnion,
    deliveryArtifacts,
    localeDeliveryAreaConstName = "LOCALE_DELIVERY_AREA",
    hasLazy,
    loadOnInitSet,
    lazyEntries,
  } = options;

  const hasLocaleUnion = Boolean(requestLocaleUnion);
  const localeTemplateType = formatLocaleTemplateType(localeTypeName, hasLocaleUnion);

  const localeBlock = requestLocaleUnion
    ? `${localeFallback ? formatLocaleFallbackBlock(localeFallback, localeFallbackConstName, localeFallbackTypeName) : ""}` +
      `export type ${localeTypeName} = ${requestLocaleUnion};\n\n`
    : "";

  const deliveryAreaBlock =
    deliveryAreaTypeName && deliveryAreaUnion
      ? `export type ${deliveryAreaTypeName} = ${deliveryAreaUnion};\n\n` +
        (deliveryArtifacts
          ? formatLocaleDeliveryAreaBlock(
              deliveryArtifacts,
              localeDeliveryAreaConstName,
              localeTypeName,
              deliveryAreaTypeName
            )
          : "")
      : "";

  let paramsBlock: string;
  let schemaBlock: string;

  if (isSingle) {
    const onlyNamespace = entries[0]!.namespace;
    const keyTypes = paramsByNamespace[onlyNamespace] ?? {};
    const paramsLines = Object.entries(keyTypes)
      .map(([key, type]) => `  ${key}: ${type};`)
      .join("\n");

    paramsBlock = `export type ${paramsTypeName} = {\n${paramsLines}\n};`;

    const schemaLines = Object.keys(keyTypes)
      .map((key) => `  ${key}: ${localeTemplateType};`)
      .join("\n");

    schemaBlock = `export type ${schemaTypeName} = {\n${schemaLines}\n};`;
  } else {
    const namespaceBlocks = entries
      .map((entry) => {
        const keyTypes = paramsByNamespace[entry.namespace] ?? {};
        const lines = Object.entries(keyTypes)
          .map(([key, type]) => `    ${key}: ${type};`)
          .join("\n");
        return `  ${entry.namespace}: {\n${lines}\n  };`;
      })
      .join("\n");

    paramsBlock = `export type ${paramsTypeName} = {\n${namespaceBlocks}\n};`;

    const schemaLines = entries
      .map((entry) => {
        const keyTypes = paramsByNamespace[entry.namespace] ?? {};
        const lines = Object.keys(keyTypes)
          .map((key) => `    ${key}: ${localeTemplateType};`)
          .join("\n");
        return `  ${entry.namespace}: {\n${lines}\n  };`;
      })
      .join("\n");

    schemaBlock = `export type ${schemaTypeName} = {\n${schemaLines}\n};`;
  }

  const lazyTypesBlock = hasLazy
    ? formatLazyTypesBlock(loadOnInitSet, lazyEntries, schemaTypeName)
    : "";

  return (
    `${GENERATED_FILE_BANNER}` +
    `export const I18N_MODE = '${isSingle ? "single" : "multi"}' as const;\n\n` +
    `${localeBlock}` +
    `${deliveryAreaBlock}` +
    `${paramsBlock}\n\n` +
    `${schemaBlock}\n` +
    `${lazyTypesBlock}`
  );
}
