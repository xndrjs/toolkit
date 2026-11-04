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

  section("getOrder — viewer");
  await root.withExecutionContext(
    async (surface) => {
      console.log('getOrder({ id: "42" }) →', await surface.getOrder({ id: "42" }));
      console.log('getOrder({ id: "missing" }) →', await surface.getOrder({ id: "missing" }));
    },
    { params: { role: "viewer" } }
  );

  section("getOrder — guest (policy before storage)");
  await root.withExecutionContext(
    async (surface) => {
      console.log('getOrder({ id: "42" }) →', await surface.getOrder({ id: "42" }));
    },
    { params: { role: "guest" } }
  );

  section("watchOrders — full consume");
  await root.withExecutionContext(
    async (surface) => {
      const events = [];
      for await (const event of surface.watchOrders({ id: "42" })) events.push(event);
      console.log('watchOrders({ id: "42" }) →', events);
    },
    { params: { role: "viewer" } }
  );

  section("watchOrders — early break");
  await root.withExecutionContext(
    async (surface) => {
      for await (const event of surface.watchOrders({ id: "42" })) {
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
