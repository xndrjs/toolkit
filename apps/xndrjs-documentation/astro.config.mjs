// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

// https://astro.build/config
export default defineConfig({
  site: "https://www.xndrjs.dev",
  integrations: [
    mermaid(),
    starlight({
      title: "xndrjs",
      customCss: ["./src/styles/brand-typography.css", "./src/styles/blog-layout.css"],
      routeMiddleware: "./src/routeData.ts",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/xndrjs/toolkit" }],
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
              items: [
                { label: "Introduction", slug: "v0/getting-started/introduction" },
                { label: "Mental model", slug: "v0/getting-started/mental-model" },
                { label: "Installation", slug: "v0/getting-started/installation" },
                { label: "First model", slug: "v0/getting-started/first-model" },
                { label: "Choose an adapter", slug: "v0/getting-started/choosing-adapter" },
              ],
            },
            {
              label: "Domain toolkit",
              items: [
                {
                  label: "Domain package",
                  items: [
                    { label: "Overview", slug: "v0/domain/overview" },
                    { label: "Validators and errors", slug: "v0/domain/validators-errors" },
                    { label: "Primitives and shapes", slug: "v0/domain/primitives-shapes" },
                    { label: "Capabilities", slug: "v0/domain/capabilities" },
                    { label: "Proofs", slug: "v0/domain/proofs" },
                    { label: "Compose and pipe", slug: "v0/domain/compose-pipe" },
                  ],
                },
                {
                  label: "Validation adapters",
                  items: [
                    { label: "Zod", slug: "v0/adapters/zod" },
                    { label: "Valibot", slug: "v0/adapters/valibot" },
                    { label: "AJV", slug: "v0/adapters/ajv" },
                  ],
                },
              ],
            },
            {
              label: "Application toolkit",
              items: [
                {
                  label: "Application resources",
                  slug: "v0/application/application-resources",
                },
              ],
            },
            {
              label: "Infrastructure toolkit",
              items: [
                { label: "Tasks", slug: "v0/infrastructure/tasks" },
                { label: "Contentful to Zod", slug: "v0/infrastructure/contentful-to-zod" },
                {
                  label: "i18n",
                  items: [
                    { label: "Overview", slug: "v0/infrastructure/i18n" },
                    { label: "Dictionaries", slug: "v0/infrastructure/i18n/dictionaries" },
                    { label: "Delivery", slug: "v0/infrastructure/i18n/delivery" },
                    { label: "Codegen", slug: "v0/infrastructure/i18n/codegen" },
                    { label: "Runtime", slug: "v0/infrastructure/i18n/runtime" },
                    { label: "React", slug: "v0/infrastructure/i18n/react" },
                    { label: "Locale fallback", slug: "v0/infrastructure/i18n/locale-fallback" },
                    { label: "Lazy loading", slug: "v0/infrastructure/i18n/lazy-loading" },
                    { label: "External validation", slug: "v0/infrastructure/i18n/validation" },
                    { label: "Configuration", slug: "v0/infrastructure/i18n/configuration" },
                    {
                      label: "Errors & exports",
                      slug: "v0/infrastructure/i18n/errors-and-exports",
                    },
                  ],
                },
              ],
            },
            {
              label: "Reference",
              items: [
                { label: "API surface", slug: "v0/reference/api-surface" },
                { label: "Package map", slug: "v0/reference/package-map" },
              ],
            },
          ],
        },
      ],
    }),
  ],
});
