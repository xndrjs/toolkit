import { printCompositionPlan, section } from "../shared/print-plan";
import { composeEditorial } from "./composition";

async function main(): Promise<void> {
  await using root = composeEditorial();
  printCompositionPlan("editorial composition", root.describePlan());

  section("same route, two entry boundaries");
  await root.withExecutionContext(async (surface) => {
    const path = "/news/hello-forma";
    console.log("getSitemapEntry →", await surface.getSitemapEntry({ path }));
    console.log("createPagePreview →", await surface.createPagePreview({ pathname: path }));
  });

  section("each boundary keeps its own expected-error vocabulary");
  await root.withExecutionContext(async (surface) => {
    console.log("getSitemapEntry →", await surface.getSitemapEntry({ path: "/missing" }));
    console.log("createPagePreview →", await surface.createPagePreview({ pathname: "/missing" }));
  });

  section("dispose");
  console.log("leaving await using root → composition dispose");
}

await main();
