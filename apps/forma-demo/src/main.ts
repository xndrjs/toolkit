/**
 * Forma PoC demo — Orders surface over Postgres via an adapter provider
 * (snake_case rows → camelCase Order), with a per-execution-context DB connection.
 */
import type { Result } from "@xndrjs/forma";
import { root } from "./composition";
import type { FindError, Order } from "./core-orders/index";

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
