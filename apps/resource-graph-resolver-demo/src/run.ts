import { ResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";

import {
  createCmsDataLoader,
  demoCmsStore,
  footerEntryAri,
  heroEntryAri,
  logoAssetAri,
  menuEntryAri,
  pageEntryAri,
  productEntryAri,
  tabEntryAri,
  tabsEntryAri,
} from "./infrastructure/cms/index.js";
import { createDemoDataGateway } from "./infrastructure/demo-data-gateway.js";
import { createDemoExpansionPort } from "./infrastructure/expansion-policies.js";
import {
  createIntegrationDataLoader,
  tshirtIntegrationAri,
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

const resolvedCount = [
  pageEntryAri,
  tabsEntryAri,
  tabEntryAri,
  heroEntryAri,
  productEntryAri,
  menuEntryAri,
  footerEntryAri,
  logoAssetAri,
  tshirtIntegrationAri,
].filter((resource) => output.contentMap.has(resource)).length;

trace.logSummary(resolvedCount, output.errors.length);

if (output.errors.length > 0) {
  console.error(output.errors);
  process.exitCode = 1;
}
