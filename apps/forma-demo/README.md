# @xndrjs/forma-demo

Runnable Node PoC for `@xndrjs/forma`: Orders surface, Postgres infrastructure, and an Adapter when shapes differ (snake_case rows → camelCase `Order`).

```bash
pnpm --filter @xndrjs/forma-demo start
```

## Layout

```
src/core-orders/                 # Orders boundary (intents + providers)
src/infrastructure-postgres/     # Postgres boundary (intents + providers)
src/adapter-orders-postgres/     # adapter("orders-postgres", Orders).adapt(FindOrder)…
src/composition.ts               # surface + wiring only
src/main.ts                      # run: withExecutionContext → call surface → root.dispose
```

`PgOrder` uses `order_id` / `amount_cents`; Orders uses `id` / `total`. The Adapter realizes `FindOrder` via `SelectOrder` — no binding.
