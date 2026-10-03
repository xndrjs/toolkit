// @ts-check
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

/** TextMate grammar from ziel-vscode; Shiki fence id is lowercase `ziel`. */
const zielGrammarPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../packages/ziel-vscode/syntaxes/ziel.tmLanguage.json"
);
const zielGrammar = {
  ...JSON.parse(fs.readFileSync(zielGrammarPath, "utf-8")),
  name: "ziel",
};

/**
 * Old docs paths → semantic IA (/v0 and /latest).
 * One key per path (no trailing-slash twin): Astro `trailingSlash: 'ignore'` matches both.
 */
const docsPathRedirects = {
  "/v0/domain/overview": "/v0/modeling/overview",
  "/v0/domain/mental-model": "/v0/modeling/mental-model",
  "/v0/domain/choosing-adapter": "/v0/modeling/choosing-adapter",
  "/v0/domain/validators-errors": "/v0/modeling/validators-errors",
  "/v0/domain/primitives-shapes": "/v0/modeling/primitives-shapes",
  "/v0/domain/capabilities": "/v0/modeling/capabilities",
  "/v0/domain/proofs": "/v0/modeling/proofs",
  "/v0/domain/compose-pipe": "/v0/modeling/compose-pipe",

  "/v0/adapters/zod": "/v0/modeling/adapters/zod",
  "/v0/adapters/first-model": "/v0/modeling/first-model",
  "/v0/modeling/adapters/first-model": "/v0/modeling/first-model",
  "/v0/adapters/valibot": "/v0/modeling/adapters/valibot",
  "/v0/adapters/ajv": "/v0/modeling/adapters/ajv",

  "/v0/application/addressable-resources": "/v0/resource-orchestration/addressable-resources",
  "/v0/application/application-resources": "/v0/resource-orchestration/addressable-resources",
  "/v0/infrastructure/resource-graph-resolver":
    "/v0/resource-orchestration/resource-graph-resolver",
  "/v0/infrastructure/ziel": "/v0/resource-orchestration/ziel",

  "/v0/infrastructure/i18n": "/v0/localization/i18n",
  "/v0/infrastructure/i18n/dictionaries": "/v0/localization/i18n/dictionaries",
  "/v0/infrastructure/i18n/delivery": "/v0/localization/i18n/delivery",
  "/v0/infrastructure/i18n/codegen": "/v0/localization/i18n/codegen",
  "/v0/infrastructure/i18n/runtime": "/v0/localization/i18n/runtime",
  "/v0/infrastructure/i18n/react": "/v0/localization/i18n/react",
  "/v0/infrastructure/i18n/locale-fallback": "/v0/localization/i18n/locale-fallback",
  "/v0/infrastructure/i18n/lazy-loading": "/v0/localization/i18n/lazy-loading",
  "/v0/infrastructure/i18n/validation": "/v0/localization/i18n/validation",
  "/v0/infrastructure/i18n/configuration": "/v0/localization/i18n/configuration",
  "/v0/infrastructure/i18n/errors-and-exports": "/v0/localization/i18n/errors-and-exports",

  "/v0/infrastructure/contentful-to-zod": "/v0/integrations/contentful-to-zod",
  "/v0/infrastructure/tasks": "/v0/concurrency/tasks",

  "/latest/domain/overview": "/latest/modeling/overview",
  "/latest/domain/mental-model": "/latest/modeling/mental-model",
  "/latest/domain/choosing-adapter": "/latest/modeling/choosing-adapter",
  "/latest/domain/validators-errors": "/latest/modeling/validators-errors",
  "/latest/domain/primitives-shapes": "/latest/modeling/primitives-shapes",
  "/latest/domain/capabilities": "/latest/modeling/capabilities",
  "/latest/domain/proofs": "/latest/modeling/proofs",
  "/latest/domain/compose-pipe": "/latest/modeling/compose-pipe",

  "/latest/adapters/zod": "/latest/modeling/adapters/zod",
  "/latest/adapters/first-model": "/latest/modeling/first-model",
  "/latest/modeling/adapters/first-model": "/latest/modeling/first-model",
  "/latest/adapters/valibot": "/latest/modeling/adapters/valibot",
  "/latest/adapters/ajv": "/latest/modeling/adapters/ajv",

  "/latest/application/addressable-resources":
    "/latest/resource-orchestration/addressable-resources",
  "/latest/application/application-resources":
    "/latest/resource-orchestration/addressable-resources",
  "/latest/infrastructure/resource-graph-resolver":
    "/latest/resource-orchestration/resource-graph-resolver",
  "/latest/infrastructure/ziel": "/latest/resource-orchestration/ziel",

  "/latest/infrastructure/i18n": "/latest/localization/i18n",
  "/latest/infrastructure/i18n/dictionaries": "/latest/localization/i18n/dictionaries",
  "/latest/infrastructure/i18n/delivery": "/latest/localization/i18n/delivery",
  "/latest/infrastructure/i18n/codegen": "/latest/localization/i18n/codegen",
  "/latest/infrastructure/i18n/runtime": "/latest/localization/i18n/runtime",
  "/latest/infrastructure/i18n/react": "/latest/localization/i18n/react",
  "/latest/infrastructure/i18n/locale-fallback": "/latest/localization/i18n/locale-fallback",
  "/latest/infrastructure/i18n/lazy-loading": "/latest/localization/i18n/lazy-loading",
  "/latest/infrastructure/i18n/validation": "/latest/localization/i18n/validation",
  "/latest/infrastructure/i18n/configuration": "/latest/localization/i18n/configuration",
  "/latest/infrastructure/i18n/errors-and-exports": "/latest/localization/i18n/errors-and-exports",

  "/latest/infrastructure/contentful-to-zod": "/latest/integrations/contentful-to-zod",
  "/latest/infrastructure/tasks": "/latest/concurrency/tasks",
};

// https://astro.build/config
export default defineConfig({
  site: "https://www.xndrjs.dev",
  redirects: {
    ...docsPathRedirects,
    "/blog/from-query-keys-to-application-resource-identifiers":
      "/blog/from-query-keys-to-addressable-resource-identifiers",
  },
  integrations: [
    mermaid(),
    starlight({
      title: "xndrjs",
      expressiveCode: {
        shiki: {
          langs: [zielGrammar],
          langAlias: {
            Ziel: "ziel",
          },
        },
      },
      customCss: ["./src/styles/brand-typography.css", "./src/styles/blog-layout.css"],
      routeMiddleware: "./src/routeData.ts",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/xndrjs/toolkit" },
        {
          icon: "linkedin",
          label: "LinkedIn",
          href: "https://www.linkedin.com/in/fabio-fognani-ba461b51/",
        },
      ],
      components: {
        Head: "./src/components/Head.astro",
        Header: "./src/components/Header.astro",
        MobileMenuFooter: "./src/components/MobileMenuFooter.astro",
        Sidebar: "./src/components/Sidebar.astro",
        PageSidebar: "./src/components/PageSidebar.astro",
        PageTitle: "./src/components/PageTitle.astro",
        Footer: "./src/components/Footer.astro",
      },
      sidebar: [
        {
          label: "v0 (preview)",
          items: [
            { label: "Version overview", slug: "v0" },
            {
              label: "Start here",
              items: [{ label: "Introduction", slug: "v0/getting-started/introduction" }],
            },
            {
              label: "Modeling",
              items: [
                {
                  label: "Domain package",
                  items: [
                    { label: "Overview", slug: "v0/modeling/overview" },
                    { label: "Mental model", slug: "v0/modeling/mental-model" },
                    { label: "Choose an adapter", slug: "v0/modeling/choosing-adapter" },
                    { label: "First model", slug: "v0/modeling/first-model" },
                    { label: "Validators and errors", slug: "v0/modeling/validators-errors" },
                    { label: "Primitives and shapes", slug: "v0/modeling/primitives-shapes" },
                    { label: "Capabilities", slug: "v0/modeling/capabilities" },
                    { label: "Proofs", slug: "v0/modeling/proofs" },
                    { label: "Compose and pipe", slug: "v0/modeling/compose-pipe" },
                  ],
                },
                {
                  label: "Validation adapters",
                  items: [
                    { label: "Zod", slug: "v0/modeling/adapters/zod" },
                    { label: "Valibot", slug: "v0/modeling/adapters/valibot" },
                    { label: "AJV", slug: "v0/modeling/adapters/ajv" },
                  ],
                },
              ],
            },
            {
              label: "Resource Orchestration",
              items: [
                {
                  label: "Addressable resources",
                  slug: "v0/resource-orchestration/addressable-resources",
                },
                {
                  label: "Resource graph resolver",
                  slug: "v0/resource-orchestration/resource-graph-resolver",
                },
                { label: "Ziel", slug: "v0/resource-orchestration/ziel" },
              ],
            },
            {
              label: "Localization",
              items: [
                {
                  label: "i18n",
                  items: [
                    { label: "Overview", slug: "v0/localization/i18n" },
                    { label: "Dictionaries", slug: "v0/localization/i18n/dictionaries" },
                    { label: "Delivery", slug: "v0/localization/i18n/delivery" },
                    { label: "Codegen", slug: "v0/localization/i18n/codegen" },
                    { label: "Runtime", slug: "v0/localization/i18n/runtime" },
                    { label: "React", slug: "v0/localization/i18n/react" },
                    { label: "Locale fallback", slug: "v0/localization/i18n/locale-fallback" },
                    { label: "Lazy loading", slug: "v0/localization/i18n/lazy-loading" },
                    { label: "External validation", slug: "v0/localization/i18n/validation" },
                    { label: "Configuration", slug: "v0/localization/i18n/configuration" },
                    {
                      label: "Errors & exports",
                      slug: "v0/localization/i18n/errors-and-exports",
                    },
                  ],
                },
              ],
            },
            {
              label: "Integrations",
              items: [{ label: "Contentful to Zod", slug: "v0/integrations/contentful-to-zod" }],
            },
            {
              label: "Concurrency / Workflows",
              items: [{ label: "Tasks", slug: "v0/concurrency/tasks" }],
            },
          ],
        },
      ],
    }),
  ],
});
