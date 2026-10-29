/**
 * Forma PoC demo — Orders surface over Postgres via adapter()
 * (snake_case rows → camelCase Order), with a per-execution-context DB connection.
 */
import { root } from "./composition";

async function main(): Promise<void> {
  const hit = await root.withExecutionContext(async (surface) => {
    const found = await surface.getOrder({ id: "42" });
    if (!found.ok) {
      throw new Error(`expected order 42, got ${JSON.stringify(found.error)}`);
    }

    const miss = await surface.getOrder({ id: "missing" });
    if (miss.ok) {
      throw new Error("expected not_found for missing id");
    }

    return found;
  });

  await root.dispose();

  console.log(
    `forma-demo ok: getOrder(42) → total=${hit.value.total}; not_found for missing; disposed`
  );
}

await main();
