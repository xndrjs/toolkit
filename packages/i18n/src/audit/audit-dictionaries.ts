import path from "node:path";
import type { DictionaryJson } from "../codegen/types.js";
import { buildRequiredLocales, enrichLocaleFallback } from "../codegen/locale-policy.js";
import { resolveLocaleTemplate } from "../resolve-locale.js";
import { CodegenConfig } from "../codegen/codegen-config-schema.js";

export type FailOnCriterion = "effective" | "direct" | "any";

export interface I18nAuditReport {
  requiredLocales: string[];
  localeFallback?: Record<string, string | null>;
  summary: Record<string, Record<string, { missingDirect: number; missingEffective: number }>>;
  missingDirectByLocale: Record<string, Record<string, string[]>>;
  missingEffectiveByLocale: Record<string, Record<string, string[]>>;
}

export interface AuditDictionariesOptions {
  namespaces: Record<string, DictionaryJson>;
  config: Pick<CodegenConfig, "localeFallback" | "defaultNamespace">;
  treatEmptyAsMissing?: boolean;
}

function isDirectlyMissing(
  localesByKey: Record<string, string>,
  locale: string,
  treatEmptyAsMissing: boolean
): boolean {
  const template = localesByKey[locale];
  if (template === undefined) {
    return true;
  }
  return treatEmptyAsMissing && template === "";
}

function isEffectivelyMissing(
  localesByKey: Record<string, string>,
  locale: string,
  localeFallback: Record<string, string | null> | undefined,
  treatEmptyAsMissing: boolean
): boolean {
  const resolved = resolveLocaleTemplate(localesByKey, locale, localeFallback);
  if (resolved === undefined) {
    return true;
  }
  return treatEmptyAsMissing && resolved.template === "";
}

function collectDictionaryLocales(namespaces: Record<string, DictionaryJson>): Set<string> {
  const locales = new Set<string>();

  for (const dictionary of Object.values(namespaces)) {
    for (const localesByKey of Object.values(dictionary)) {
      for (const locale of Object.keys(localesByKey)) {
        locales.add(locale);
      }
    }
  }

  return locales;
}

/**
 * Audit pipeline: reports missing translations per namespace/locale (direct and
 * effective via fallback), using the same locale policy as codegen.
 */
export function auditDictionaries(options: AuditDictionariesOptions): I18nAuditReport {
  const { namespaces, config, treatEmptyAsMissing = true } = options;
  const dictionaryLocales = collectDictionaryLocales(namespaces);
  const requiredLocales = buildRequiredLocales(dictionaryLocales, config.localeFallback);
  const localeFallbackForAudit = config.localeFallback
    ? enrichLocaleFallback(dictionaryLocales, config.localeFallback)
    : undefined;

  const summary: I18nAuditReport["summary"] = {};
  const missingDirectByLocale: I18nAuditReport["missingDirectByLocale"] = {};
  const missingEffectiveByLocale: I18nAuditReport["missingEffectiveByLocale"] = {};

  for (const [namespace, dictionary] of Object.entries(namespaces)) {
    summary[namespace] = {};
    missingDirectByLocale[namespace] = {};
    missingEffectiveByLocale[namespace] = {};

    for (const locale of requiredLocales) {
      summary[namespace]![locale] = { missingDirect: 0, missingEffective: 0 };
      missingDirectByLocale[namespace]![locale] = [];
      missingEffectiveByLocale[namespace]![locale] = [];
    }

    for (const [key, localesByKey] of Object.entries(dictionary)) {
      for (const locale of requiredLocales) {
        if (isDirectlyMissing(localesByKey, locale, treatEmptyAsMissing)) {
          summary[namespace]![locale]!.missingDirect += 1;
          missingDirectByLocale[namespace]![locale]!.push(key);
        }

        if (
          isEffectivelyMissing(localesByKey, locale, localeFallbackForAudit, treatEmptyAsMissing)
        ) {
          summary[namespace]![locale]!.missingEffective += 1;
          missingEffectiveByLocale[namespace]![locale]!.push(key);
        }
      }
    }

    for (const locale of requiredLocales) {
      missingDirectByLocale[namespace]![locale]!.sort();
      missingEffectiveByLocale[namespace]![locale]!.sort();
    }
  }

  return {
    requiredLocales,
    ...(localeFallbackForAudit !== undefined ? { localeFallback: localeFallbackForAudit } : {}),
    summary,
    missingDirectByLocale,
    missingEffectiveByLocale,
  };
}

export function reportHasGaps(report: I18nAuditReport, criterion: FailOnCriterion): boolean {
  for (const namespace of Object.keys(report.missingDirectByLocale)) {
    for (const locale of report.requiredLocales) {
      const direct = report.missingDirectByLocale[namespace]?.[locale] ?? [];
      const effective = report.missingEffectiveByLocale[namespace]?.[locale] ?? [];

      if (criterion === "direct" && direct.length > 0) {
        return true;
      }
      if (criterion === "effective" && effective.length > 0) {
        return true;
      }
      if (criterion === "any" && (direct.length > 0 || effective.length > 0)) {
        return true;
      }
    }
  }

  return false;
}

export interface RunAuditOptions {
  projectRoot: string;
  config: CodegenConfig;
  treatEmptyAsMissing?: boolean;
  failOn?: FailOnCriterion;
}

export interface RunAuditResult {
  report: I18nAuditReport;
  exitCode: 0 | 1;
}

export async function runAuditFromConfig(options: RunAuditOptions): Promise<RunAuditResult> {
  const { resolveNamespaces } = await import("../codegen/config.js");
  const { readDictionaryFile } = await import("../codegen/read-dictionary.js");

  const config = options.config;
  const entries = resolveNamespaces(config);
  const namespaces: Record<string, DictionaryJson> = {};

  for (const entry of entries) {
    const absolutePath = path.resolve(options.projectRoot, entry.filePath);
    namespaces[entry.namespace] = readDictionaryFile(absolutePath);
  }

  const report = auditDictionaries({
    namespaces,
    config,
    ...(options.treatEmptyAsMissing !== undefined
      ? { treatEmptyAsMissing: options.treatEmptyAsMissing }
      : {}),
  });

  const exitCode =
    options.failOn && reportHasGaps(report, options.failOn) ? (1 as const) : (0 as const);

  return { report, exitCode };
}
