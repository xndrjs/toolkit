import { printCompositionPlan, section } from "../shared/print-plan";
import { composeEditorial } from "./composition";

async function main(): Promise<void> {
  await using root = composeEditorial();
  printCompositionPlan("editorial composition", root.describePlan());

  section("two entry boundaries, private catalog and routing boundaries");
  await root.withExecutionContext(async (surface) => {
    console.dir({ generateSitemap: await surface.generateSitemap() }, { depth: null });
    console.log(
      "createPagePreview →",
      await surface.createPagePreview({ pageId: "page-hello-forma" })
    );
  });

  section("page builder keeps its own expected-error vocabulary");
  await root.withExecutionContext(async (surface) => {
    console.log("createPagePreview →", await surface.createPagePreview({ pageId: "missing" }));
  });

  section("dispose");
  console.log("leaving await using root → composition dispose");
}

await main();
