import { boundary, err, ok } from "@xndrjs/forma";
import type { Connection, PgFindError, PgOrder, PgOrderId } from "./types";

export type { Connection, PgFindError, PgOrder, PgOrderId } from "./types";

const rows: ReadonlyMap<string, PgOrder> = new Map([["42", { id: "42", total: 100 }]]);

export const Postgres = boundary("postgres");

export const ConnectionIntent = Postgres.intent("connection").contract<void, Connection, never>();
/** Fresh connection per execution context; cleaned up on ctx.dispose(). */
export const ConnectionProvider = ConnectionIntent.provide.perContext().with(({ lifetime }) => {
  const connection: Connection = {
    label: "pg-connection",
    lookup: (id) => rows.get(id),
  };
  lifetime.onDispose(() => {
    console.log(`disposed ${connection.label}`);
  });
  return function () {
    return ok(connection);
  };
});

export const SelectOrder = Postgres.intent("selectOrder").contract<
  PgOrderId,
  PgOrder,
  PgFindError
>();
export const SelectOrderProvider = SelectOrder.provide
  .perContext()
  .using({ connection: ConnectionIntent })
  .with(
    ({ deps: { connection } }) =>
      async function (id) {
        const opened = await connection();
        if (!opened.ok) {
          return err({ kind: "not_found" as const });
        }
        const row = opened.value.lookup(id.id);
        return row ? ok(row) : err({ kind: "not_found" as const });
      }
  );
