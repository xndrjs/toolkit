// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "xndrjs",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/xndrjs/toolkit" }],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Introduction", slug: "getting-started/introduction" },
            { label: "Mental model", slug: "getting-started/mental-model" },
            { label: "Installation", slug: "getting-started/installation" },
            { label: "First model", slug: "getting-started/first-model" },
            { label: "Choose an adapter", slug: "getting-started/choosing-adapter" },
          ],
        },
        {
          label: "Domain",
          items: [
            { label: "Overview", slug: "domain/overview" },
            { label: "Validators and errors", slug: "domain/validators-errors" },
            { label: "Primitives and shapes", slug: "domain/primitives-shapes" },
            { label: "Capabilities", slug: "domain/capabilities" },
            { label: "Proofs", slug: "domain/proofs" },
            { label: "Compose and pipe", slug: "domain/compose-pipe" },
          ],
        },
        {
          label: "Adapters",
          items: [
            { label: "Zod", slug: "adapters/zod" },
            { label: "Valibot", slug: "adapters/valibot" },
            { label: "AJV", slug: "adapters/ajv" },
          ],
        },
        {
          label: "Application toolkit",
          items: [{ label: "Ports, data, tasks", slug: "application/toolkit" }],
        },
        {
          label: "Reference",
          items: [
            { label: "API surface", slug: "reference/api-surface" },
            { label: "Package map", slug: "reference/package-map" },
          ],
        },
      ],
    }),
  ],
});
