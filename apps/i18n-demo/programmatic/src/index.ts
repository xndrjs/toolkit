import { formatIssues } from "@xndrjs/i18n/validation";
import { i18n } from "./i18n";
import { validateExternalDictionaryPartial } from "./i18n/generated/dictionary-schema.generated";
import type {
  ProgrammaticDemoLocale,
  ProgrammaticDemoSchema,
} from "./i18n/generated/i18n-types.generated";

const demoLocale = "en" as const satisfies ProgrammaticDemoLocale;

function exampleEagerUsage(): void {
  const { t } = i18n;

  console.log("welcome @ en:", t("welcome", "en", { name: "Ada" }));
  console.log("welcome @ it:", t("welcome", "it", { name: "Ada" }));
  console.log("goodbye @ en (onMissing: key):", t("goodbye" as "welcome", "en", { name: "Ada" }));
}

async function exampleExternalDictionaryHydration(): Promise<void> {
  const raw: unknown = {
    welcome: {
      en: "Hello {name} from programmatic CMS!",
    },
  };

  const result = validateExternalDictionaryPartial(raw);
  if (!result.ok) {
    console.error(formatIssues(result.issues));
    return;
  }

  const { t, set } = i18n.forLocale(demoLocale);

  for (const key of Object.keys(result.data) as (keyof ProgrammaticDemoSchema)[]) {
    const template = result.data[key]?.[demoLocale];
    if (template !== undefined) {
      set(key, template);
    }
  }

  console.log("welcome @ en (hydrated):", t("welcome", { name: "Ada" }));
}

async function main(): Promise<void> {
  exampleEagerUsage();
  await exampleExternalDictionaryHydration();
}

void main();
