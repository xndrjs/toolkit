/**
 * Forma PoC demo — Orders surface over a Postgres Intent via binding,
 * with a per-execution-context DB connection.
 */
import type { Result } from "@xndrjs/forma";
import { root } from "./composition.js";
import type { FindError, Order } from "./orders/index.js";

async function main(): Promise<void> {
  const ctx = root.createExecutionContext();

  const hit: Result<Order, FindError> = await ctx.getOrder({ id: "42" });
  if (!hit.ok) {
    throw new Error(`expected order 42, got ${JSON.stringify(hit.error)}`);
  }

  const miss = await ctx.getOrder({ id: "missing" });
  if (miss.ok) {
    throw new Error("expected not_found for missing id");
  }

  await ctx.dispose();
  await root.dispose();

  console.log(
    `forma-demo ok: getOrder(42) → total=${hit.value.total}; not_found for missing; disposed`
  );
}

await main();
