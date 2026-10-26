import type { AnyConstructDefinition } from "./define-structure.js";

/**
 * Explicit many-dependency slot: `{ construct: C, many: true }`.
 * Prefer {@link array} sugar at call sites.
 */
export type DepSlotMany<C extends AnyConstructDefinition = AnyConstructDefinition> = {
  readonly kind: "dep-slot";
  readonly construct: C;
  readonly many: true;
};

/**
 * Explicit single-dependency slot (optional; a bare ConstructDefinition is preferred).
 */
export type DepSlotSingle<C extends AnyConstructDefinition = AnyConstructDefinition> = {
  readonly kind: "dep-slot";
  readonly construct: C;
  readonly many: false;
};

/** Value allowed in a construct dependency map. */
export type DeclaredDep =
  | AnyConstructDefinition
  | DepSlotMany<AnyConstructDefinition>
  | DepSlotSingle<AnyConstructDefinition>;

export type DeclaredDepMap = Record<string, DeclaredDep>;

/** Sugar for `{ kind: "dep-slot", construct, many: true }`. */
export function array<C extends AnyConstructDefinition>(construct: C): DepSlotMany<C> {
  return { kind: "dep-slot", construct, many: true };
}

export function isDepSlot(
  value: unknown
): value is DepSlotMany<AnyConstructDefinition> | DepSlotSingle<AnyConstructDefinition> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "dep-slot" &&
    "construct" in value &&
    typeof (value as { many?: unknown }).many === "boolean"
  );
}

export function resolveDepSlot(slot: DeclaredDep): {
  readonly construct: AnyConstructDefinition;
  readonly many: boolean;
} {
  if (isDepSlot(slot)) {
    return { construct: slot.construct, many: slot.many };
  }
  return { construct: slot, many: false };
}

/** Construct definition referenced by a declared dep slot. */
export type DepConstructOf<S extends DeclaredDep> =
  S extends DepSlotMany<infer C>
    ? C
    : S extends DepSlotSingle<infer C>
      ? C
      : S extends AnyConstructDefinition
        ? S
        : never;

export type IsManyDep<S extends DeclaredDep> =
  S extends DepSlotMany<AnyConstructDefinition> ? true : false;
