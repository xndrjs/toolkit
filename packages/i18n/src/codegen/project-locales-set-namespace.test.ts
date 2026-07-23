import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { spawnWithTsx } from "../test-utils/spawn-with-tsx.js";

const codegenScript = fileURLToPath(new URL("./generate-i18n-types.ts", import.meta.url));
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

function runCodegen(cwd: string) {
  return spawnWithTsx(codegenScript, ["--config", "i18n.codegen.json"], {
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
      projectName: "App",
      namespaces: {
        default: "src/i18n/translations/default.json",
        billing: "src/i18n/translations/billing.json",
      },
      codegenPath: "src/i18n",
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
            "@xndrjs/i18n/validation": [join(packageRoot, "src/validation/index.ts")],
          },
        },
        include: ["src/**/*.ts"],
      },
      null,
      2
    )
  );
}

describe("codegen instance + load", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("emits createI18n wired to namespaceLoaders", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-project-locales-"));
    setupMultiCodegenFixture(tempDir);

    const factory = readFileSync(join(tempDir, "src/i18n/instance.generated.ts"), "utf8");
    expect(factory).toContain("export function createI18n(");
    expect(factory).toContain("namespaceLoaders");
  });

  it("passes tsc when loading via generated namespaceLoaders", () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-i18n-project-locales-"));
    setupMultiCodegenFixture(tempDir);

    writeFileSync(
      join(tempDir, "src/hydrate-billing.ts"),
      [
        `import { createI18n } from "./i18n/instance.generated.js";`,
        ``,
        `async function hydrateBilling() {`,
        `  const { t } = await createI18n().load({ namespaces: ["billing"], locale: "en" });`,
        `  return t("billing", "invoice_summary", { count: 1 });`,
        `}`,
        ``,
        `export { hydrateBilling };`,
      ].join("\n")
    );

    writeTscProject(tempDir);

    const tsc = runTsc(join(tempDir, "tsconfig.json"));
    expect(tsc.status, `${tsc.stdout}\n${tsc.stderr}`).toBe(0);
  });
});
