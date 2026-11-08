import { DatabaseSync } from "node:sqlite";
import { boundary } from "@xndrjs/forma";
import { z } from "zod";

export type SqliteOrderLookup = { readonly order_id: string };
export type SqliteFindError = { readonly code: "NO_ROW" };

const SqliteOrderSchema = z
  .object({
    order_id: z.string().min(1),
    amount_cents: z.number().int().nonnegative(),
  })
  .strict();

const SqliteOrderEventSchema = z
  .object({
    order_id: z.string().min(1),
    status: z.string().min(1),
  })
  .strict();

export type SqliteOrder = z.output<typeof SqliteOrderSchema>;
export type SqliteOrderEvent = z.output<typeof SqliteOrderEventSchema>;

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE orders (
      order_id TEXT PRIMARY KEY,
      amount_cents INTEGER NOT NULL
    );

    CREATE TABLE order_events (
      sequence INTEGER PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(order_id),
      status TEXT NOT NULL
    );

    INSERT INTO orders (order_id, amount_cents) VALUES ('42', 10000);
    INSERT INTO order_events (sequence, order_id, status) VALUES
      (1, '42', 'open'),
      (2, '42', 'paid'),
      (3, '42', 'shipped');
  `);
  return database;
}

export const Sqlite = boundary("sqlite");

const Database = Sqlite.intent("database").contract<void, DatabaseSync, never>();

/** A real SQLite database, lazily opened once and closed with the composition. */
export const DatabaseProvider = Database.provide.perComposition().with(({ lifetime, out }) => {
  const database = createDatabase();
  lifetime.onDispose(() => {
    database.close();
    console.log("closed sqlite database");
  });
  return function openDatabase() {
    return out.success(database);
  };
});

export const SelectOrder = Sqlite.intent("selectOrder").contract<
  SqliteOrderLookup,
  SqliteOrder,
  SqliteFindError
>();

export const SelectOrderProvider = SelectOrder.provide
  .using({ database: Database })
  .with(({ deps: { database }, out }) => {
    return async function selectOrder(id) {
      const opened = await database();
      if (opened.kind !== "success") return opened;

      const row: unknown = opened.value
        .prepare("SELECT order_id, amount_cents FROM orders WHERE order_id = ?")
        .get(id.order_id);

      if (row === undefined) return out.expectedError({ code: "NO_ROW" });

      const parsed = SqliteOrderSchema.safeParse(row);
      if (!parsed.success) return out.unexpectedFailure();
      return out.success(parsed.data);
    };
  });

export const SelectOrderEvents = Sqlite.stream("selectOrderEvents").contract<
  SqliteOrderLookup,
  SqliteOrderEvent,
  SqliteFindError
>();

export const SelectOrderEventsProvider = SelectOrderEvents.provide
  .using({ database: Database })
  .with(({ deps: { database }, out }) => {
    return async function* selectOrderEvents(id, invocation) {
      const opened = await database();
      if (opened.kind !== "success") {
        yield opened;
      } else {
        const rows: readonly unknown[] = opened.value
          .prepare("SELECT order_id, status FROM order_events WHERE order_id = ? ORDER BY sequence")
          .all(id.order_id);

        if (rows.length === 0) {
          yield out.expectedError({ code: "NO_ROW" });
        } else {
          for (const row of rows) {
            invocation.signal.throwIfAborted();
            const parsed = SqliteOrderEventSchema.safeParse(row);
            if (!parsed.success) {
              yield out.unexpectedFailure();
            } else {
              yield out.success(parsed.data);
            }
          }
        }
      }
    };
  });
