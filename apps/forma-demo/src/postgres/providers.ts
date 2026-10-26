import { err, ok } from "@xndrjs/forma";
import { ConnectionIntent, Ready, SelectOrder } from "./intents.js";
import type { Connection, PgOrder } from "./types.js";

const rows: ReadonlyMap<string, PgOrder> = new Map([["42", { id: "42", total: 100 }]]);

export const ReadyProvider = Ready.provide.with(() => ok(true as const));

/** Fresh connection per execution context; cleaned up on ctx.dispose(). */
export const ConnectionProvider = ConnectionIntent.provide
  .perContext()
  .using({ ready: Ready })
  .with((_deps, life) => {
    const connection: Connection = {
      label: "pg-connection",
      lookup: (id) => rows.get(id),
    };
    life.onDispose(() => {
      console.log(`disposed ${connection.label}`);
    });
    return () => ok(connection);
  });

export const SelectOrderProvider = SelectOrder.provide
  .perContext()
  .using({ connection: ConnectionIntent })
  .with(({ connection }) => async (id) => {
    const opened = await connection();
    if (!opened.ok) {
      return err({ kind: "not_found" as const });
    }
    const row = opened.value.lookup(id.id);
    return row ? ok(row) : err({ kind: "not_found" as const });
  });
