/**
 * Example only — not wired into the Next.js page.
 *
 * Typical CMS / editorial flow:
 * 1. Update authoring JSON (e.g. translations/cms.json)
 * 2. Refresh delivery artifacts for the touched namespaces (same ICU contract)
 * 3. Clients with loaderStrategy: "fetch" pick up the new JSON without an app rebuild
 *
 * If keys or ICU params changed, use runCodegen instead and ship a release.
 *
 * Run (from repo root, after a prior codegen):
 *   pnpm exec tsx apps/i18n-demo/programmatic/i18n/regenerate-namespaces.example.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { regenerateNamespaces } from "@xndrjs/i18n/codegen";

const i18nDir = path.dirname(fileURLToPath(import.meta.url));

const result = regenerateNamespaces({
  configPath: path.join(i18nDir, "i18n.codegen.json"),
  namespaces: ["cms"],
});

console.log("Regenerated:", result.compiledFiles);
