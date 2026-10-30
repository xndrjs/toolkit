# @xndrjs/forma-demo

Runnable Node walkthrough for `@xndrjs/forma`: Orders surface with GetOrder policy (role params), dual Adapters (Postgres shape-map vs in-memory passthrough), `WatchOrders` Stream Intent, async fake connection, and Design C disposal (`await using` + `withExecutionContext`).

It prints the composition plan and call outcomes so you can see the shape of the system. It is not a test — expectations live in `packages/forma/test`.

```bash
pnpm --filter @xndrjs/forma-demo start:postgres
pnpm --filter @xndrjs/forma-demo start:memory
```

## Layout

```
src/core-orders/                 # Orders boundary — GetOrder + WatchOrders entry and stream seam
src/infrastructure-postgres/     # Postgres boundary — async Connection + SelectOrder
src/adapter-orders-postgres/     # FindOrder + WatchOrderEvents via Postgres shapes
src/adapter-orders-memory/       # FindOrder + WatchOrderEvents via in-memory map
src/composition.ts               # composePostgres / composeMemory (same surface)
src/main.ts                      # describe plan + walk unary / stream / break / dispose
```

`PgOrder` uses `order_id` / `amount_cents`; Orders uses `id` / `total`. The Postgres Adapter maps rows; the memory Adapter stores Orders shapes directly. Cross-boundary wiring uses Adapter (not Intent alias). Guests are `forbidden` before FindOrder runs.

## Stream Intent (`WatchOrders`)

`WatchOrders` is the public entry Intent and is realized by an Orders-owned Provider. It delegates to the unresolved `WatchOrderEvents` seam, which is realized privately by the selected Adapter. Both compositions declare `entryBoundaries: [Orders]`; an Adapter never becomes a Surface root. The surface returns a cold, single-consumer `AsyncIterable` owned by the execution context:

- creating the iterable does nothing; the first `next()` materializes and leases;
- natural completion and `break` both run generator `finally` (logged as `watchOrders(…) closed`);
- disposing the context (end of `withExecutionContext`) closes any still-active streams;
- a signal already aborted at first pull prevents materialization; later host abort unblocks cooperative I/O but does **not** auto-dispose the context;
- `root.describePlan()` shows Entry Boundaries, Surface-root provenance, and per-Provider `origin` / `mode` / nested `lifetime` (Adapter ids such as `orders-memory` appear on private seam realizations).

See [packages/forma/docs/streaming-intents.md](../../packages/forma/docs/streaming-intents.md) and [GLOSSARY.md](../../packages/forma/GLOSSARY.md) (**Modality**, **Stream invocation**).
