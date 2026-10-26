# @xndrjs/forma-demo

Runnable Node PoC for `@xndrjs/forma`: Orders surface, Postgres binding, and a `.perContext()` session.

```bash
pnpm --filter @xndrjs/forma-demo start
```

## Layout

```
src/orders/        # Orders boundary (intents + providers)
src/postgres/      # Postgres boundary (intents + providers)
src/composition.ts # bindings + surface only
src/main.ts        # run: open context → call surface → dispose
```
