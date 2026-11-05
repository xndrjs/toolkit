import { printCompositionPlan, section } from "../shared/print-plan";
import { createOrdersRoot, type OrdersStorage } from "./composition";

function parseStorage(argv: readonly string[]): OrdersStorage {
  const argument = argv.filter((value) => value !== "--")[0];
  if (argument === undefined || argument === "sqlite") return "sqlite";
  if (argument === "memory") return "memory";
  throw new Error(`unknown storage "${argument}" (expected sqlite | memory)`);
}

async function main(): Promise<void> {
  const storage = parseStorage(process.argv.slice(2));
  await using root = createOrdersRoot(storage);

  printCompositionPlan(`orders composition (storage: ${storage})`, root.describePlan());

  section("getOrderDetails — viewer");
  await root.withExecutionContext(
    async (surface) => {
      console.log('getOrderDetails("42") →', await surface.getOrderDetails("42"));
      console.log('getOrderDetails("missing") →', await surface.getOrderDetails("missing"));
    },
    { params: { role: "viewer" } }
  );

  section("getOrderDetails — guest (policy before storage)");
  await root.withExecutionContext(
    async (surface) => {
      console.log('getOrderDetails("42") →', await surface.getOrderDetails("42"));
    },
    { params: { role: "guest" } }
  );

  section("watchOrderEvents — full consume");
  await root.withExecutionContext(
    async (surface) => {
      const events = [];
      for await (const event of surface.watchOrderEvents("42")) events.push(event);
      console.log('watchOrderEvents("42") →', events);
    },
    { params: { role: "viewer" } }
  );

  section("watchOrderEvents — early break");
  await root.withExecutionContext(
    async (surface) => {
      for await (const event of surface.watchOrderEvents("42")) {
        console.log("first event →", event);
        break;
      }
    },
    { params: { role: "viewer" } }
  );

  section("dispose");
  console.log("leaving await using root → composition dispose");
}

await main();
