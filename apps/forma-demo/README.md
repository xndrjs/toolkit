# @xndrjs/forma-demo

Runnable Node PoC for `@xndrjs/forma`: Orders surface with real GetOrder policy (role params), dual Adapters (Postgres shape-map vs in-memory passthrough), async fake connection, and Design C disposal (`await using` + `withExecutionContext`).

```bash
pnpm --filter @xndrjs/forma-demo start            # postgres Adapter (default)
pnpm --filter @xndrjs/forma-demo start -- memory  # in-memory Adapter
```

## Layout

```
src/core-orders/                 # Orders boundary — GetOrder auth policy over FindOrder
src/infrastructure-postgres/     # Postgres boundary — async Connection + SelectOrder
src/adapter-orders-postgres/     # adapter("orders-postgres", Orders) → FindOrderViaPostgresProvider
src/adapter-orders-memory/       # adapter("orders-memory", Orders) → FindOrderViaMemoryProvider
src/composition.ts               # composePostgres / composeMemory (same surface)
src/main.ts                      # await using root → withExecutionContext({ params })
```

`PgOrder` uses `order_id` / `amount_cents`; Orders uses `id` / `total`. The Postgres Adapter maps rows; the memory Adapter stores Orders shapes directly. Cross-boundary wiring uses Adapter (not Intent alias). Guests are `forbidden` before FindOrder runs.
