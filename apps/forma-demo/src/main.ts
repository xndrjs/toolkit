/**
 * Forma PoC demo — Orders surface over selectable Adapters (postgres | memory).
 * Walks the composition plan and a few calls, printing shape and outcomes.
 * Not a test: no assertions on results.
 *
 * Usage:
 *   pnpm --filter @xndrjs/forma-demo start:postgres
 *   pnpm --filter @xndrjs/forma-demo start:memory
 */
import { createRoot, type AdapterKind } from "./composition";

function parseKind(argv: readonly string[]): AdapterKind {
  const arg = argv.filter((a) => a !== "--")[0];
  if (arg === undefined || arg === "postgres") return "postgres";
  if (arg === "memory") return "memory";
  throw new Error(`unknown adapter kind "${arg}" (expected postgres | memory)`);
}

function section(title: string): void {
  console.log(`\n── ${title}`);
}

/** Display form used by Forma diagnostics: `boundary.intent`. */
function formatIntent(identity: readonly [string, string]): string {
  return `${identity[0]}.${identity[1]}`;
}

async function main(): Promise<void> {
  const kind = parseKind(process.argv.slice(2));

  await using root = createRoot(kind);

  const plan = root.describePlan();
  section(`composition (kind: ${kind})`);
  console.log("entryBoundaries:", plan.entryBoundaries);
  console.log(
    "surface:",
    plan.surface.map((entry) => ({
      alias: entry.alias,
      intent: formatIntent(entry.intent),
      origin: entry.origin,
    }))
  );
  console.log(
    "providers:",
    plan.providers.map((p) => ({
      intent: formatIntent(p.intent),
      mode: p.mode,
      origin: p.origin,
      lifetime: {
        declared: p.lifetime.declared,
        effective: p.lifetime.effective,
        ...(p.lifetime.narrowedBy
          ? { narrowedBy: p.lifetime.narrowedBy.map(formatIntent).join(" → ") }
          : {}),
      },
    }))
  );

  section("getOrder — viewer");
  await root.withExecutionContext(
    async (surface) => {
      const found = await surface.getOrder({ id: "42" });
      console.log('getOrder({ id: "42" }) →', found);

      const miss = await surface.getOrder({ id: "missing" });
      console.log('getOrder({ id: "missing" }) →', miss);
    },
    { params: { role: "viewer" } }
  );

  section("getOrder — guest (policy before FindOrder)");
  await root.withExecutionContext(
    async (surface) => {
      const denied = await surface.getOrder({ id: "42" });
      console.log('getOrder({ id: "42" }) →', denied);
    },
    { params: { role: "guest" } }
  );

  section("watchOrders — full consume");
  await root.withExecutionContext(
    async (surface) => {
      const events = [];
      for await (const event of surface.watchOrders({ id: "42" })) {
        events.push(event);
      }
      console.log('watchOrders({ id: "42" }) →', events);
    },
    { params: { role: "viewer" } }
  );

  section("watchOrders — early break (generator finally / Adapter cleanup)");
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
