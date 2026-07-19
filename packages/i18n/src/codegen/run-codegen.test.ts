import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { regenerateNamespaces } from "./regenerate-namespaces.js";
import { runCodegen } from "./run-codegen.js";

function setupProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), "xndrjs-i18n-a5-"));
  mkdirSync(join(projectRoot, "translations"), { recursive: true });
  mkdirSync(join(projectRoot, "generated"), { recursive: true });

  writeFileSync(
    join(projectRoot, "translations/default.json"),
    JSON.stringify(
      {
        welcome: { en: "Hello {name}!", it: "Ciao {name}!" },
        login: { en: "Login", it: "Accedi" },
      },
      null,
      2
    )
  );

  writeFileSync(
    join(projectRoot, "translations/billing.json"),
    JSON.stringify(
      {
        invoice_summary: {
          en: "You have {count} invoices",
          it: "Hai {count} fatture",
        },
      },
      null,
      2
    )
  );

  writeFileSync(
    join(projectRoot, "i18n.codegen.json"),
    JSON.stringify(
      {
        projectName: "App",
        namespaces: {
          default: "translations/default.json",
          billing: "translations/billing.json",
        },
        codegenPath: "generated",
        delivery: "split-by-locale",
        artifactsPath: "generated",
      },
      null,
      2
    )
  );

  return projectRoot;
}

describe("runCodegen + regenerateNamespaces", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("runCodegen emits types, loaders, and delivery JSON", () => {
    projectRoot = setupProject();
    const result = runCodegen({
      configPath: join(projectRoot, "i18n.codegen.json"),
      log: false,
    });

    expect(result.generatedFiles).toEqual(
      expect.arrayContaining([
        "generated/i18n-types.generated.ts",
        "generated/instance.generated.ts",
        "generated/namespace-loaders.generated.ts",
        "generated/dictionary-schema.generated.ts",
      ])
    );
    expect(
      readFileSync(join(projectRoot, "generated/translations/default.en.json"), "utf8")
    ).toContain("Hello {name}!");
    expect(
      readFileSync(join(projectRoot, "generated/namespace-loaders.generated.ts"), "utf8")
    ).toContain("import('./translations/default.en.json')");
  });

  it("runCodegen emits fetch loaders when configured", () => {
    projectRoot = setupProject();
    writeFileSync(
      join(projectRoot, "i18n.codegen.json"),
      JSON.stringify(
        {
          projectName: "App",
          namespaces: {
            default: "translations/default.json",
            billing: "translations/billing.json",
          },
          codegenPath: "generated",
          delivery: "split-by-locale",
          artifactsPath: "generated",
          loaderStrategy: "fetch",
        },
        null,
        2
      )
    );

    runCodegen({ configPath: join(projectRoot, "i18n.codegen.json"), log: false });
    const loaders = readFileSync(
      join(projectRoot, "generated/namespace-loaders.generated.ts"),
      "utf8"
    );
    expect(loaders).toContain('fetchImpl({ locale, namespace: "default" })');
    expect(loaders).toContain("createNamespaceLoaders");
  });

  it("regenerateNamespaces refreshes selected delivery JSON without rewriting types", () => {
    projectRoot = setupProject();
    runCodegen({ configPath: join(projectRoot, "i18n.codegen.json"), log: false });

    const typesBefore = readFileSync(
      join(projectRoot, "generated/i18n-types.generated.ts"),
      "utf8"
    );
    const instanceBefore = readFileSync(
      join(projectRoot, "generated/instance.generated.ts"),
      "utf8"
    );
    const billingBefore = readFileSync(
      join(projectRoot, "generated/translations/billing.en.json"),
      "utf8"
    );

    writeFileSync(
      join(projectRoot, "translations/default.json"),
      JSON.stringify(
        {
          welcome: { en: "Hi {name}!", it: "Ciao {name}!" },
          login: { en: "Login", it: "Accedi" },
        },
        null,
        2
      )
    );

    regenerateNamespaces({
      configPath: join(projectRoot, "i18n.codegen.json"),
      namespaces: ["default"],
      log: false,
    });

    const en = JSON.parse(
      readFileSync(join(projectRoot, "generated/translations/default.en.json"), "utf8")
    );
    expect(en.welcome.en).toBe("Hi {name}!");
    expect(en.login.en).toBe("Login");
    expect(readFileSync(join(projectRoot, "generated/translations/billing.en.json"), "utf8")).toBe(
      billingBefore
    );
    expect(readFileSync(join(projectRoot, "generated/i18n-types.generated.ts"), "utf8")).toBe(
      typesBefore
    );
    expect(readFileSync(join(projectRoot, "generated/instance.generated.ts"), "utf8")).toBe(
      instanceBefore
    );
  });

  it("regenerateNamespaces rejects authoring that changes ICU args", () => {
    projectRoot = setupProject();
    runCodegen({ configPath: join(projectRoot, "i18n.codegen.json"), log: false });

    writeFileSync(
      join(projectRoot, "translations/default.json"),
      JSON.stringify(
        {
          welcome: { en: "Hello {name} {extra}!", it: "Ciao {name} {extra}!" },
          login: { en: "Login", it: "Accedi" },
        },
        null,
        2
      )
    );

    expect(() =>
      regenerateNamespaces({
        configPath: join(projectRoot, "i18n.codegen.json"),
        namespaces: ["default"],
        log: false,
      })
    ).toThrow(/Contract change requires runCodegen/);
  });

  it("regenerateNamespaces rejects empty or unknown namespaces", () => {
    projectRoot = setupProject();
    runCodegen({ configPath: join(projectRoot, "i18n.codegen.json"), log: false });

    expect(() =>
      regenerateNamespaces({
        configPath: join(projectRoot, "i18n.codegen.json"),
        namespaces: [],
        log: false,
      })
    ).toThrow(/non-empty namespaces/);

    expect(() =>
      regenerateNamespaces({
        configPath: join(projectRoot, "i18n.codegen.json"),
        namespaces: ["missing"],
        log: false,
      })
    ).toThrow(/Unknown namespace/);
  });

  it("regenerateNamespaces requires a prior runCodegen schema", () => {
    projectRoot = setupProject();

    expect(() =>
      regenerateNamespaces({
        configPath: join(projectRoot, "i18n.codegen.json"),
        namespaces: ["default"],
        log: false,
      })
    ).toThrow(/Run runCodegen first/);
  });
});
