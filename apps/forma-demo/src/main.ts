/**
 * Forma PoC demo — Orders surface over selectable Adapters (postgres | memory),
 * with params-gated GetOrder policy and Design C exception-safe disposal.
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

  console.log(
    `forma-demo ok (${kind}): getOrder(42) → total=${hit.value.total}; not_found; guest forbidden; disposed`
  );
}

await main();
