import { ResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";

import { aggregatePageGraph } from "./infrastructure/aggregate-page-graph.js";
import { createCmsDataLoader, demoCmsStore, pageEntryAri } from "./infrastructure/cms/index.js";
import { createDemoDataGateway } from "./infrastructure/demo-data-gateway.js";
import { createDemoExpansionPort } from "./infrastructure/expansion-policies.js";
import {
  createIntegrationDataLoader,
  demoProductCatalog,
} from "./infrastructure/integration/index.js";
import {
  createConsoleResolveTrace,
  withLoggingCmsLoader,
  withLoggingExpansionPort,
  withLoggingGateway,
  withLoggingIntegrationLoader,
} from "./infrastructure/logging/resolve-trace.js";

const trace = createConsoleResolveTrace();

const cms = withLoggingCmsLoader(createCmsDataLoader(demoCmsStore), trace);
const integration = withLoggingIntegrationLoader(createIntegrationDataLoader(), trace);
const gateway = withLoggingGateway(createDemoDataGateway(cms, integration), trace);
const expansionPort = withLoggingExpansionPort(createDemoExpansionPort(), trace);

const engine = new ResolveContentGraphEngine(gateway, expansionPort);

console.log(`Resolve demo — root ${pageEntryAri.format()}`);

const output = await engine.execute({
  root: pageEntryAri,
  context: undefined,
  missingResourceMode: "throw",
});

const resolvedCount =
  demoCmsStore.entries.size + demoCmsStore.assets.size + demoProductCatalog.size;

trace.logSummary(resolvedCount, output.errors.length);

if (output.errors.length > 0) {
  console.error(output.errors);
  process.exitCode = 1;
} else {
  const { page } = aggregatePageGraph({ result: output, root: pageEntryAri });
  console.log("\nAggregated page graph:\n");
  console.log(JSON.stringify(page, null, 2));
}
