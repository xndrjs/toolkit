import {
  formatDeliveryArtifactsBlock,
  formatLocaleDeliveryAreaBlock,
  type DeliveryArtifactsMap,
} from "../delivery-artifacts.js";
import { formatLocaleFallbackBlock } from "../locale-fallback.js";
import { GENERATED_FILE_BANNER } from "../paths.js";
import type { NamespaceEntry } from "../types.js";

/**
 * Emits lazy-load type aliases. Every namespace is lazy; `InitialSchema` is empty
 * (cold start / hydrate via `resources` only).
 */
export function formatLazyTypesBlock(lazyEntries: NamespaceEntry[]): string {
  const lazyUnion =
    lazyEntries.length > 0
      ? lazyEntries.map((entry) => `'${entry.namespace}'`).join(" | ")
      : "never";

  return (
    `export type LazyNamespace = ${lazyUnion};\n` +
    `/** Empty cold-start schema — namespaces arrive via \`namespaceLoaders\`. */\n` +
    `export type InitialSchema = Record<string, never>;\n\n`
  );
}

export function formatLocaleTemplateType(localeTypeName: string, hasLocaleUnion: boolean): string {
  if (!hasLocaleUnion) {
    return "Partial<Record<string, string>>";
  }
  return `Partial<Record<${localeTypeName}, string>>`;
}

export interface TypesFileOptions {
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
  /** Sorted request locales — emits `ProjectLocales` const + `ProjectLocale` type. */
  requestLocales: readonly string[];
  deliveryAreaTypeName?: string;
  /** Sorted delivery area names — emits `ProjectDeliveryAreas` const + type. */
  deliveryAreaNames?: readonly string[];
  deliveryArtifacts?: DeliveryArtifactsMap;
  localeDeliveryAreaConstName?: string;
  lazyEntries: NamespaceEntry[];
}

export function formatTypesFile(options: TypesFileOptions): string {
  const {
    entries,
    paramsTypeName,
    schemaTypeName,
    localeTypeName,
    localeFallbackConstName,
    localeFallbackTypeName,
    localeFallback,
    paramsByNamespace,
    requestLocales,
    deliveryAreaTypeName,
    deliveryAreaNames,
    deliveryArtifacts,
    localeDeliveryAreaConstName = "LOCALE_DELIVERY_AREA",
    lazyEntries,
  } = options;

  const hasLocaleUnion = requestLocales.length > 0;
  const localeTemplateType = formatLocaleTemplateType(localeTypeName, hasLocaleUnion);
  const localesConstName = `${localeTypeName}s`;

  const localeBlock = hasLocaleUnion
    ? `${localeFallback ? formatLocaleFallbackBlock(localeFallback, localeFallbackConstName, localeFallbackTypeName) : ""}` +
      `export const ${localesConstName} = [${requestLocales.map((locale) => JSON.stringify(locale)).join(", ")}] as const;\n` +
      `export type ${localeTypeName} = (typeof ${localesConstName})[number];\n\n`
    : "";

  const deliveryAreasConstName = deliveryAreaTypeName ? `${deliveryAreaTypeName}s` : undefined;
  const deliveryAreaBlock =
    deliveryAreaTypeName &&
    deliveryAreasConstName &&
    deliveryAreaNames &&
    deliveryAreaNames.length > 0
      ? `export const ${deliveryAreasConstName} = [${deliveryAreaNames.map((area) => JSON.stringify(area)).join(", ")}] as const;\n` +
        `export type ${deliveryAreaTypeName} = (typeof ${deliveryAreasConstName})[number];\n\n` +
        (deliveryArtifacts
          ? formatDeliveryArtifactsBlock(
              deliveryArtifacts,
              "DELIVERY_ARTIFACTS",
              localeTypeName,
              deliveryAreaTypeName
            ) +
            formatLocaleDeliveryAreaBlock(
              deliveryArtifacts,
              localeDeliveryAreaConstName,
              localeTypeName,
              deliveryAreaTypeName
            )
          : "")
      : "";

  const namespaceBlocks = entries
    .map((entry) => {
      const keyTypes = paramsByNamespace[entry.namespace] ?? {};
      const lines = Object.entries(keyTypes)
        .map(([key, type]) => `    ${key}: ${type};`)
        .join("\n");
      return `  ${entry.namespace}: {\n${lines}\n  };`;
    })
    .join("\n");

  const paramsBlock = `export type ${paramsTypeName} = {\n${namespaceBlocks}\n};`;

  const schemaLines = entries
    .map((entry) => {
      const keyTypes = paramsByNamespace[entry.namespace] ?? {};
      const lines = Object.keys(keyTypes)
        .map((key) => `    ${key}: ${localeTemplateType};`)
        .join("\n");
      return `  ${entry.namespace}: {\n${lines}\n  };`;
    })
    .join("\n");

  const schemaBlock = `export type ${schemaTypeName} = {\n${schemaLines}\n};`;

  const lazyTypesBlock = formatLazyTypesBlock(lazyEntries);

  return (
    `${GENERATED_FILE_BANNER}` +
    `export const I18N_MODE = 'multi' as const;\n\n` +
    `${localeBlock}` +
    `${deliveryAreaBlock}` +
    `${paramsBlock}\n\n` +
    `${schemaBlock}\n` +
    `${lazyTypesBlock}`
  );
}
