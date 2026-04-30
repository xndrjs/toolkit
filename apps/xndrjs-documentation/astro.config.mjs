// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "xndrjs",
      customCss: ["./src/styles/brand-typography.css"],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/xndrjs/toolkit" }],
      components: {
        Header: "./src/components/Header.astro",
        MobileMenuFooter: "./src/components/MobileMenuFooter.astro",
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
              label: "Domain",
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
              label: "Adapters",
              items: [
                { label: "Zod", slug: "v0/adapters/zod" },
                { label: "Valibot", slug: "v0/adapters/valibot" },
                { label: "AJV", slug: "v0/adapters/ajv" },
              ],
            },
            {
              label: "Application toolkit",
              items: [{ label: "Ports, data, tasks", slug: "v0/application/toolkit" }],
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
