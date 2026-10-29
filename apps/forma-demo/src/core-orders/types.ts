/** Orders-owned contract types (duplicated per boundary — not shared with Postgres). */

export type OrderId = { readonly id: string };
export type Order = { readonly id: string; readonly total: number };

export type FindError = { readonly kind: "not_found" } | { readonly kind: "forbidden" };

/** Execution params: role gates GetOrder before FindOrder runs. */
export type DemoParams = {
  readonly role: "admin" | "viewer" | "guest";
};
