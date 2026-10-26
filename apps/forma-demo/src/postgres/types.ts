/** Postgres-owned contract types (structurally matching Orders, but local to this boundary). */

export type PgOrderId = { readonly id: string };
export type PgOrder = { readonly id: string; readonly total: number };
export type PgFindError = { readonly kind: "not_found" };

export type Connection = {
  readonly label: string;
  lookup(id: string): PgOrder | undefined;
};
