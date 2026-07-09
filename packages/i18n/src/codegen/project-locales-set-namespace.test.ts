import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import billingDictionary from "./fixtures/billing-namespace.json";

const codegenScript = fileURLToPath(new URL("./generate-i18n-types.ts", import.meta.url));
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

type BillingNamespace = typeof billingDictionary;

function runCodegen(cwd: string) {
  return spawnSync("tsx", [codegenScript, "--config", "i18n.codegen.json"], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

function runTsc(projectPath: string) {
  return spawnSync("pnpm", ["exec", "tsc", "--noEmit", "-p", projectPath], {
    cwd: packageRoot,
    encoding: "utf8",
    env: process.env,
  });
}

function setupMultiCodegenFixture(tempDir: string) {
  const i18nDir = join(tempDir, "src/i18n");
  const translationsDir = join(i18nDir, "translations");
  mkdirSync(translationsDir, { recursive: true });

  writeFileSync(
    join(translationsDir, "default.json"),
    JSON.stringify({
      login_button: { en: "Login" },
    })
  );
  writeFileSync(
    join(translationsDir, "billing.json"),
    readFileSync(
      fileURLToPath(new URL("./fixtures/billing-namespace.json", import.meta.url)),
      "utf8"
    )
  );

  writeFileSync(
    join(tempDir, "i18n.codegen.json"),
    JSON.stringify({
      namespaces: {
        default: "src/i18n/translations/default.json",
        billing: "src/i18n/translations/billing.json",
      },
      typesOutput: "src/i18n/i18n-types.generated.ts",
      dictionaryOutput: "src/i18n/dictionary.generated.ts",
      instanceOutput: "src/i18n/instance.generated.ts",
      paramsTypeName: "AppParams",
      schemaTypeName: "AppSchema",
      localeFallback: {
        en: null,
        it: "en",
      },
    })
  );

  const codegen = runCodegen(tempDir);
  expect(codegen.status, codegen.stderr || codegen.stdout).toBe(0);
}

function writeTscProject(tempDir: string) {
  writeFileSync(
    join(tempDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
          resolveJsonModule: true,
          esModuleInterop: true,
          skipLibCheck: true,
          paths: {
            "@xndrjs/i18n": [join(packageRoot, "src/index.ts")],
          },
        },
        include: ["src/**/*.ts"],
      },
      null,
      2
    )
  );
}

describe("codegen projectLocales + setNamespace", () => {
  describe("generated instance output", () => {
    let tempDir: string;

    afterEach(() => {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("emits projectNamespaceLocales for multi mode with schema-typed namespace payloads", () => {
      tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-project-locales-"));
      setupMultiCodegenFixture(tempDir);

      const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
      expect(factory).toContain('dictionary: AppSchema["billing"]');
      expect(factory).toContain(
        "projectNamespacesLocalesCore(dictionary, locales, LOCALE_FALLBACK)"
      );
    });

    it("passes tsc when hydrating with projectNamespaceLocales before setNamespace", () => {
      tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-project-locales-"));
      setupMultiCodegenFixture(tempDir);

      writeFileSync(
        join(tempDir, "src/hydrate-billing.ts"),
        [
          `import { createI18n, projectNamespaceLocales } from "./i18n/instance.generated.js";`,
          `import { defaultDictionary } from "./i18n/dictionary.generated.js";`,
          `import billingDictionary from "./i18n/translations/billing.json";`,
          ``,
          `const i18n = createI18n(defaultDictionary);`,
          `i18n.setNamespace("billing", projectNamespaceLocales(billingDictionary, ["en"]));`,
        ].join("\n")
      );

      writeTscProject(tempDir);

      const tsc = runTsc(join(tempDir, "tsconfig.json"));
      expect(tsc.status, `${tsc.stdout}\n${tsc.stderr}`).toBe(0);
    });

    it("passes tsc when replacing the full schema with projectLocales before setAll", () => {
      tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-project-locales-"));
      setupMultiCodegenFixture(tempDir);

      writeFileSync(
        join(tempDir, "src/hydrate-all.ts"),
        [
          `import { createI18n, projectLocales } from "./i18n/instance.generated.js";`,
          `import { defaultDictionary } from "./i18n/dictionary.generated.js";`,
          `import type { AppSchema } from "./i18n/i18n-types.generated.js";`,
          `import billingDictionary from "./i18n/translations/billing.json";`,
          `import defaultNs from "./i18n/translations/default.json";`,
          ``,
          `const fullDictionary = {`,
          `  default: defaultNs,`,
          `  billing: billingDictionary,`,
          `} satisfies AppSchema;`,
          ``,
          `const i18n = createI18n(defaultDictionary);`,
          `i18n.setAll(projectLocales(fullDictionary, ["en"]));`,
        ].join("\n")
      );

      writeTscProject(tempDir);

      const tsc = runTsc(join(tempDir, "tsconfig.json"));
      expect(tsc.status, `${tsc.stdout}\n${tsc.stderr}`).toBe(0);
    });

    it("types projectNamespaceLocales result as the namespace schema", () => {
      type AppSchema = {
        billing: BillingNamespace;
      };

      type ProjectNamespaceLocalesBilling = (
        dictionary: AppSchema["billing"],
        locales: readonly ("en" | "it")[]
      ) => AppSchema["billing"];

      expectTypeOf<ReturnType<ProjectNamespaceLocalesBilling>>().toEqualTypeOf<BillingNamespace>();
    });
  });
});
