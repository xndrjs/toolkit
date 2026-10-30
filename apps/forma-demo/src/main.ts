/**
 * Forma PoC demo — Orders surface over selectable Adapters (postgres | memory),
 * with params-gated GetOrder policy, WatchOrders stream Intent, and Design C
 * exception-safe disposal.
 *
 * Usage:
 *   pnpm --filter @xndrjs/forma-demo start
 *   pnpm --filter @xndrjs/forma-demo start -- memory
 */
import { createRoot, type AdapterKind } from "./composition";

function parseKind(argv: readonly string[]): AdapterKind {
  const arg = argv.filter((a) => a !== "--")[0];
  if (arg === undefined || arg === "postgres") return "postgres";
  if (arg === "memory") return "memory";
  throw new Error(`unknown adapter kind "${arg}" (expected postgres | memory)`);
}

async function main(): Promise<void> {
  const kind = parseKind(process.argv.slice(2));

  await using root = createRoot(kind);

  const plan = root.describePlan();
  if (plan.entryBoundaries.length !== 1 || plan.entryBoundaries[0] !== "orders") {
    throw new Error(`expected orders Entry Boundary, got ${JSON.stringify(plan.entryBoundaries)}`);
  }
  const watchSurface = plan.surface.find((entry) => entry.alias === "watchOrders");
  if (watchSurface?.origin.kind !== "boundary" || watchSurface.origin.id !== "orders") {
    throw new Error(`expected Orders-owned watchOrders root, got ${JSON.stringify(watchSurface)}`);
  }
  const watchPlan = plan.providers.find(
    (p) => p.intent[0] === "orders" && p.intent[1] === "watchOrders"
  );
  if (watchPlan?.mode !== "stream") {
    throw new Error(`expected watchOrders mode=stream, got ${JSON.stringify(watchPlan)}`);
  }

  const hit = await root.withExecutionContext(
    async (surface) => {
      const found = await surface.getOrder({ id: "42" });
      if (!found.ok) {
        throw new Error(`expected order 42 for viewer, got ${JSON.stringify(found.error)}`);
      }

      const miss = await surface.getOrder({ id: "missing" });
      if (miss.ok) {
        throw new Error("expected not_found for missing id");
      }

      return found;
    },
    { params: { role: "viewer" } }
  );

  const denied = await root.withExecutionContext(
    async (surface) => surface.getOrder({ id: "42" }),
    { params: { role: "guest" } }
  );
  if (denied.ok || denied.error.kind !== "forbidden") {
    throw new Error(`expected forbidden for guest, got ${JSON.stringify(denied)}`);
  }

  // Full stream consumption — natural completion releases the context-owned invocation.
  const statuses = await root.withExecutionContext(
    async (surface) => {
      const seen: string[] = [];
      for await (const event of surface.watchOrders({ id: "42" })) {
        if (!event.ok) {
          throw new Error(`unexpected watch error: ${JSON.stringify(event.error)}`);
        }
        seen.push(event.value.status);
      }
      return seen;
    },
    { params: { role: "viewer" } }
  );
  if (statuses.join(",") !== "open,paid,shipped") {
    throw new Error(`expected status progression, got ${statuses.join(",")}`);
  }

  // Early break — Forma calls return() so the generator finally / Adapter cleanup runs
  // before the execution context finishes disposing.
  await root.withExecutionContext(
    async (surface) => {
      for await (const event of surface.watchOrders({ id: "42" })) {
        if (!event.ok) {
          throw new Error(`unexpected watch error: ${JSON.stringify(event.error)}`);
        }
        break;
      }
    },
    { params: { role: "viewer" } }
  );

  console.log(
    `forma-demo ok (${kind}): getOrder(42) → total=${hit.value.total}; not_found; guest forbidden; ` +
      `entry=orders; watchOrders root=boundary:orders mode=stream → ${statuses.join("→")}; ` +
      "break cleanup; disposed"
  );
}

await main();
