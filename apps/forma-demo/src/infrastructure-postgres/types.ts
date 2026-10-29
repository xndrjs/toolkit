/**
 * Postgres-owned row shapes — snake_case fields differ from Orders camelCase
 * (`id` / `total`), so composition needs an adapter provider.
 */

export type PgOrderId = { readonly order_id: string };
export type PgOrder = {
  readonly order_id: string;
  readonly amount_cents: number;
};
export type PgFindError = { readonly code: "NO_ROW" };

export type Connection = {
  readonly label: string;
  lookup(orderId: string): PgOrder | undefined;
};
