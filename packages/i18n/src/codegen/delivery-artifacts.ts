/** Valid TypeScript identifier / filename segment for a delivery area id. */
export const DELIVERY_AREA_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export type DeliveryArtifactsMap = Record<string, readonly string[]>;

export type DeliveryArtifactsIssue = {
  path: (string | number)[];
  message: string;
};

export function getDeliveryArtifactsStructureIssues(
  deliveryArtifacts: DeliveryArtifactsMap
): DeliveryArtifactsIssue[] {
  const issues: DeliveryArtifactsIssue[] = [];

  for (const [area, locales] of Object.entries(deliveryArtifacts)) {
    if (!DELIVERY_AREA_NAME_PATTERN.test(area)) {
      issues.push({
        path: ["deliveryArtifacts", area],
        message: `Invalid delivery area name "${area}": must match ${DELIVERY_AREA_NAME_PATTERN.source}`,
      });
    }

    if (locales.length === 0) {
      issues.push({
        path: ["deliveryArtifacts", area],
        message: `Delivery area "${area}" must include at least one locale.`,
      });
    }
  }

  const localeToArea = new Map<string, string>();
  for (const [area, locales] of Object.entries(deliveryArtifacts)) {
    for (const locale of locales) {
      const previousArea = localeToArea.get(locale);
      if (previousArea) {
        issues.push({
          path: ["deliveryArtifacts", area],
          message: `Locale "${locale}" appears in both "${previousArea}" and "${area}".`,
        });
      } else {
        localeToArea.set(locale, area);
      }
    }
  }

  return issues;
}

export function getDeliveryArtifactsPartitionIssues(
  deliveryArtifacts: DeliveryArtifactsMap,
  requestLocales: ReadonlySet<string>
): DeliveryArtifactsIssue[] {
  const issues: DeliveryArtifactsIssue[] = [];
  const artifactLocales = new Set<string>();

  for (const locales of Object.values(deliveryArtifacts)) {
    for (const locale of locales) {
      artifactLocales.add(locale);
    }
  }

  const missing = [...requestLocales].filter((locale) => !artifactLocales.has(locale)).sort();
  if (missing.length > 0) {
    issues.push({
      path: ["deliveryArtifacts"],
      message: `deliveryArtifacts is missing locales required by dictionaries and localeFallback: ${missing.join(", ")}`,
    });
  }

  const excess = [...artifactLocales].filter((locale) => !requestLocales.has(locale)).sort();
  if (excess.length > 0) {
    issues.push({
      path: ["deliveryArtifacts"],
      message: `deliveryArtifacts includes locales not required by dictionaries and localeFallback: ${excess.join(", ")}`,
    });
  }

  return issues;
}

/** Pre-emit validation gate for `deliveryArtifacts` in custom delivery mode. */
export function getDeliveryArtifactsIssues(
  deliveryArtifacts: DeliveryArtifactsMap,
  requestLocales: ReadonlySet<string>
): DeliveryArtifactsIssue[] {
  return [
    ...getDeliveryArtifactsStructureIssues(deliveryArtifacts),
    ...getDeliveryArtifactsPartitionIssues(deliveryArtifacts, requestLocales),
  ];
}

export function getDeliveryAreaNames(deliveryArtifacts: DeliveryArtifactsMap): string[] {
  return Object.keys(deliveryArtifacts).sort();
}

export function getLocaleDeliveryAreaMap(
  deliveryArtifacts: DeliveryArtifactsMap
): Record<string, string> {
  const localeToArea: Record<string, string> = {};

  for (const [area, locales] of Object.entries(deliveryArtifacts)) {
    for (const locale of locales) {
      localeToArea[locale] = area;
    }
  }

  return localeToArea;
}

export function formatLocaleDeliveryAreaBlock(
  deliveryArtifacts: DeliveryArtifactsMap,
  constName: string,
  localeTypeName: string,
  deliveryAreaTypeName: string
): string {
  const localeToArea = getLocaleDeliveryAreaMap(deliveryArtifacts);
  const lines = Object.keys(localeToArea)
    .sort()
    .map((locale) => `  ${JSON.stringify(locale)}: ${JSON.stringify(localeToArea[locale])},`)
    .join("\n");

  return `export const ${constName} = {\n${lines}\n} as const satisfies Record<${localeTypeName}, ${deliveryAreaTypeName}>;\n\n`;
}

export function getDeliveryArtifactsTypeName(deliveryAreaTypeName: string): string {
  return deliveryAreaTypeName.endsWith("DeliveryArea")
    ? deliveryAreaTypeName.replace(/DeliveryArea$/, "DeliveryArtifacts")
    : `${deliveryAreaTypeName}Artifacts`;
}

export function formatDeliveryArtifactsBlock(
  deliveryArtifacts: DeliveryArtifactsMap,
  constName: string,
  localeTypeName: string,
  deliveryAreaTypeName: string
): string {
  const deliveryArtifactsTypeName = getDeliveryArtifactsTypeName(deliveryAreaTypeName);
  const areaEntries = getDeliveryAreaNames(deliveryArtifacts)
    .map((area) => {
      const locales = [...deliveryArtifacts[area]!]
        .sort()
        .map((locale) => JSON.stringify(locale))
        .join(", ");
      return `  ${JSON.stringify(area)}: [${locales}] as const,`;
    })
    .join("\n");

  return (
    `export const ${constName} = {\n${areaEntries}\n} as const satisfies Record<${deliveryAreaTypeName}, readonly ${localeTypeName}[]>;\n\n` +
    `export type ${deliveryArtifactsTypeName} = typeof ${constName};\n\n` +
    `export type LocalesForDeliveryArea<A extends ${deliveryAreaTypeName}> = ${deliveryArtifactsTypeName}[A][number];\n\n`
  );
}
