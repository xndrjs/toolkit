import type { AnyProvider, WiringEntry, IntentAlias } from "../../alias-intent.js";
import type { Boundary } from "../../boundary.js";
import type { ReservedSurfaceAlias } from "../../string-keys.js";

declare const formaReservedSurfaceKeys: unique symbol;
declare const formaNonStringSurfaceKeys: unique symbol;
declare const formaProviderUnions: unique symbol;
declare const formaAdapterSurfaceRoots: unique symbol;
declare const formaUndeclaredEntryBoundaries: unique symbol;
declare const formaUnusedEntryBoundaries: unique symbol;
declare const formaDuplicateEntryBoundaries: unique symbol;

type IsAny<T> = 0 extends 1 & T ? true : false;

type ProviderOriginOf<P> = P extends { readonly origin: infer Origin } ? Origin : never;

type EntryBoundaryIds<Entries extends readonly Boundary<string>[]> =
  Entries[number] extends Boundary<infer Id> ? Id : never;

type IsAdapterOrigin<Origin> =
  IsAny<Origin> extends true ? false : Origin extends { readonly kind: "adapter" } ? true : false;

type AdapterSurfaceAliases<Surface extends Record<string, AnyProvider>> = {
  [K in keyof Surface & string]: IsAdapterOrigin<ProviderOriginOf<Surface[K]>> extends true
    ? K
    : never;
}[keyof Surface & string];

type BoundaryOriginId<Origin> =
  IsAny<Origin> extends true
    ? never
    : Origin extends { readonly kind: "boundary"; readonly id: infer Id extends string }
      ? Id
      : never;

type SurfaceBoundaryIds<Surface extends Record<string, AnyProvider>> = {
  [K in keyof Surface & string]: BoundaryOriginId<ProviderOriginOf<Surface[K]>>;
}[keyof Surface & string];

type UndeclaredSurfaceBoundaryIds<
  Entries extends readonly Boundary<string>[],
  Surface extends Record<string, AnyProvider>,
> = Exclude<SurfaceBoundaryIds<Surface>, EntryBoundaryIds<Entries>>;

type UnusedEntryBoundaryIds<
  Entries extends readonly Boundary<string>[],
  Surface extends Record<string, AnyProvider>,
> = Exclude<EntryBoundaryIds<Entries>, SurfaceBoundaryIds<Surface>>;

type DuplicateEntryBoundaryIds<
  Entries extends readonly Boundary<string>[],
  Seen extends string = never,
> = Entries extends readonly [infer Head, ...infer Tail]
  ? Head extends Boundary<infer Id>
    ? Tail extends readonly Boundary<string>[]
      ? Id extends Seen
        ? Id | DuplicateEntryBoundaryIds<Tail, Seen>
        : DuplicateEntryBoundaryIds<Tail, Seen | Id>
      : never
    : never
  : never;

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
 * Inspect each wiring tuple slot without recursively rebuilding its tail.
 * Heterogeneous `[A, B]` is fine; a single slot typed as `A | B` is not
 * (it would falsely register both Intents). The tuple guard intentionally leaves
 * widened arrays to the existing missing-provider diagnostics.
 */
type WiringProviderUnionSlots<W extends readonly WiringEntry[]> = number extends W["length"]
  ? never
  : {
      [K in keyof W]: [W[K]] extends [IntentAlias]
        ? never
        : IsUnion<W[K]> extends true
          ? true
          : never;
    }[number];

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

/**
 * Surface roots must come from exactly the declared, non-empty Entry Boundary set.
 * Runtime validation mirrors these checks for JavaScript, widened configs, and casts.
 */
export type AssertEntryBoundaries<
  Entries extends readonly Boundary<string>[],
  Surface extends Record<string, AnyProvider>,
> = [AdapterSurfaceAliases<Surface>] extends [never]
  ? [UndeclaredSurfaceBoundaryIds<Entries, Surface>] extends [never]
    ? [UnusedEntryBoundaryIds<Entries, Surface>] extends [never]
      ? [DuplicateEntryBoundaryIds<Entries>] extends [never]
        ? unknown
        : {
            readonly [formaDuplicateEntryBoundaries]: `Duplicate Entry Boundary id(s): ${DuplicateEntryBoundaryIds<Entries>}`;
          }
      : {
          readonly [formaUnusedEntryBoundaries]: `Entry Boundary id(s) not represented in Surface: ${UnusedEntryBoundaryIds<Entries, Surface>}`;
        }
    : {
        readonly [formaUndeclaredEntryBoundaries]: `Surface root Boundary id(s) not declared as Entry Boundaries: ${UndeclaredSurfaceBoundaryIds<Entries, Surface>}`;
      }
  : {
      readonly [formaAdapterSurfaceRoots]: `Adapter-originated Provider(s) cannot be Surface roots: ${AdapterSurfaceAliases<Surface>}`;
    };
