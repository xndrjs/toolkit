/** Orders-owned contract types (duplicated per boundary — not shared with Postgres). */

export type OrderId = { readonly id: string };
export type Order = { readonly id: string; readonly total: number };

export type FindError = { readonly code: "not_found" } | { readonly code: "forbidden" };

/** Stream item for WatchOrders — status progression for one order. */
export type OrderEvent = { readonly orderId: string; readonly status: string };

export type WatchError = { readonly code: "not_found" } | { readonly code: "unavailable" };

/** Execution params: role gates GetOrder before FindOrder runs. */
export type DemoParams = {
  readonly role: "admin" | "viewer" | "guest";
};
