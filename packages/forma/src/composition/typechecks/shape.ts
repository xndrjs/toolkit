import type { AnyProvider, WiringEntry, IntentAlias } from "../../alias-intent.js";
import type { ReservedSurfaceAlias } from "../../string-keys.js";

declare const formaReservedSurfaceKeys: unique symbol;
declare const formaNonStringSurfaceKeys: unique symbol;
declare const formaProviderUnions: unique symbol;

/**
 * `true` when `T` is a union of two or more constituents.
 * Used to reject Provider unions in surface / wiring slots (PoC policy).
 */
type IsUnion<T, U = T> = (T extends unknown ? ([U] extends [T] ? 0 : 1) : never) extends 0
  ? false
  : true;

/** Surface alias keys whose value is a Provider union. */
type SurfaceProviderUnionKeys<Surface extends Record<string, AnyProvider>> = {
  [K in keyof Surface & string]: IsUnion<Surface[K]> extends true ? K : never;
}[keyof Surface & string];

/**
 * Walk a wiring tuple slot-by-slot. Heterogeneous `[A, B]` is fine;
 * a single slot typed as `A | B` is not (would falsely register both Intents).
 * `[Head] extends [IntentAlias]` is intentional: a naked `Head extends IntentAlias`
 * would distribute over a Provider union and miss the union slot.
 */
type WiringProviderUnionSlots<W extends readonly WiringEntry[]> = W extends readonly [
  infer Head,
  ...infer Tail,
]
  ? [Head] extends [IntentAlias]
    ? Tail extends readonly WiringEntry[]
      ? WiringProviderUnionSlots<Tail>
      : never
    : IsUnion<Head> extends true
      ? true
      : Tail extends readonly WiringEntry[]
        ? WiringProviderUnionSlots<Tail>
        : never
  : never;

type ForbiddenSurfaceAliases<Surface> = Extract<keyof Surface & string, ReservedSurfaceAlias>;

type NonStringSurfaceKeys<Surface> = Exclude<keyof Surface, string>;

/**
 * Intersected into `compose` options: surface aliases must be strings and must
 * not collide with reserved lifecycle names (`dispose`, `surface`).
 */
export type AssertSurfaceAliasesSafe<Surface extends Record<string, AnyProvider>> =
  ForbiddenSurfaceAliases<Surface> extends infer Reserved
    ? [Reserved] extends [never]
      ? [NonStringSurfaceKeys<Surface>] extends [never]
        ? unknown
        : {
            readonly [formaNonStringSurfaceKeys]: "Surface aliases must be string keys";
          }
      : {
          readonly [formaReservedSurfaceKeys]: `Surface alias(es) reserved for lifecycle: ${Extract<Reserved, string>}`;
        }
    : unknown;

/**
 * Intersected into `compose` options: a surface alias or wiring Provider slot
 * must not be a Provider union. Unions make every branch’s Intent look
 * registered while runtime materializes only one — PoC rejects them.
 */
export type AssertNoProviderUnions<
  Surface extends Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[],
> =
  SurfaceProviderUnionKeys<Surface> extends infer SurfaceKeys
    ? [SurfaceKeys] extends [never]
      ? [WiringProviderUnionSlots<Wiring>] extends [never]
        ? unknown
        : {
            readonly [formaProviderUnions]: "Provider unions are not allowed in wiring; register a single concrete Provider per slot";
          }
      : {
          readonly [formaProviderUnions]: `Provider unions are not allowed on surface alias(es): ${Extract<SurfaceKeys, string>}`;
        }
    : unknown;
