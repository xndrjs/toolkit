import { createProvideApi } from "./provider/provider-builder.js";
import type { ProvideApi } from "./provider/provider-builder.types.js";

declare const formaIntentBrand: unique symbol;
declare const formaBoundaryTypeBrand: unique symbol;

const FORMA_INTENT_RUNTIME = Symbol.for("@xndrjs/forma/intent/v1");
const FORMA_BOUNDARY_RUNTIME = Symbol.for("@xndrjs/forma/boundary/v1");

/** Contract fulfillment shape: one terminal outcome vs pull-based sequence. */
export type IntentModality = "unary" | "stream";

/**
 * Canonical Intent identity: structured `(boundaryId, intentName)`.
 * Same pair → same Intent; never a fresh `Symbol` or an ambiguous `a.b` concat.
 * Modality lives on the Contract, not in the identity.
 */
export type IntentIdentity<
  BoundaryId extends string = string,
  Name extends string = string,
> = readonly [boundaryId: BoundaryId, name: Name];

/** Build the structured identity pair from an Intent-like value. */
export function intentIdentity<BoundaryId extends string, Name extends string>(intent: {
  readonly boundaryId: BoundaryId;
  readonly name: Name;
}): IntentIdentity<BoundaryId, Name> {
  return [intent.boundaryId, intent.name];
}

/**
 * Declared intention within a Boundary: stable identity `(boundaryId, name)` + contract,
 * independent of how it is fulfilled.
 *
 * - **Identity**: structured `(boundaryId, intentName)` — shared by type-level graph keys
 *   and the runtime resolver (homonymous Boundaries / repeated declarations coalesce).
 * - **Boundary brand** (`BoundaryId`): same-boundary `using` checks.
 * - **Modality**: `unary` (default via `.intent`) or `stream` (via `.stream`); fixed on the Contract.
 */
export type Intent<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Mode extends IntentModality = "unary",
> = {
  readonly boundaryId: BoundaryId;
  readonly name: Name;
  /** Contract modality (`unary` | `stream`). Identity does not include this. */
  readonly modality: Mode;
  /** Attach a realization: optional `using` / lifetime pin, then `with(({ deps?, lifetime }) => …)`. */
  readonly provide: ProvideApi<BoundaryId, Name, Input, Success, Err, Mode>;
  readonly [formaIntentBrand]: {
    readonly boundary: BoundaryId;
    readonly name: Name;
    readonly input: Input;
    readonly success: Success;
    readonly error: Err;
    readonly modality: Mode;
  };
};

/**
 * After `intent(name)` / `stream(name)`, apply the contract type arguments via `.contract`.
 *
 * Name is taken as a value first so TypeScript keeps the string literal; contract
 * types are supplied on `.contract<Input, Success, Err>()`. A single call
 * `intent<Input, Success, Err>(name)` cannot infer `Name` once the earlier type
 * arguments are explicit (TypeScript does not do partial type inference).
 */
export type IntentContractDeclarator<
  BoundaryId extends string,
  Name extends string,
  Mode extends IntentModality = "unary",
> = {
  contract<Input, Success, Err>(): Intent<BoundaryId, Name, Input, Success, Err, Mode>;
};

/**
 * Declare a unary Intent and its contract (`Input`, `Success`, expected `Error`).
 *
 * ```ts
 * Orders.intent("find").contract<OrderId, Order, FindError>();
 * ```
 */
export type IntentDeclarator<BoundaryId extends string> = <Name extends string>(
  name: Name
) => IntentContractDeclarator<BoundaryId, Name, "unary">;

/**
 * Declare a stream Intent and its contract (`Input`, stream `Item`, expected `Error`).
 *
 * ```ts
 * Orders.stream("watchOrders").contract<WatchInput, OrderEvent, WatchError>();
 * ```
 */
export type StreamDeclarator<BoundaryId extends string> = <Name extends string>(
  name: Name
) => IntentContractDeclarator<BoundaryId, Name, "stream">;

export type Boundary<BoundaryId extends string> = {
  readonly id: BoundaryId;
  readonly intent: IntentDeclarator<BoundaryId>;
  readonly stream: StreamDeclarator<BoundaryId>;
  readonly [formaBoundaryTypeBrand]: BoundaryId;
};

/** Internal runtime authenticity check. Not exported by the package entrypoint. */
export function isBoundary(value: unknown): value is Boundary<string> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[FORMA_BOUNDARY_RUNTIME] === true
  );
}

/** Internal runtime authenticity check for alias and graph validation. */
export function isIntent(
  value: unknown
): value is Intent<string, string, unknown, unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[FORMA_INTENT_RUNTIME] === true
  );
}

function createIntent<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Mode extends IntentModality,
>(
  boundaryId: BoundaryId,
  name: Name,
  modality: Mode
): Intent<BoundaryId, Name, Input, Success, Err, Mode> {
  const intent = {
    boundaryId,
    name,
    modality,
    [FORMA_INTENT_RUNTIME]: true,
  } as unknown as Intent<BoundaryId, Name, Input, Success, Err, Mode>;

  // Assign after the object exists so the builder closes over the Intent value.
  (intent as { provide: ProvideApi<BoundaryId, Name, Input, Success, Err, Mode> }).provide =
    createProvideApi(intent);

  return Object.freeze(intent);
}

/** Create an isolated architectural space and namespace for Intent identities. */
export function boundary<const BoundaryId extends string>(id: BoundaryId): Boundary<BoundaryId> {
  function intent<Name extends string>(
    name: Name
  ): IntentContractDeclarator<BoundaryId, Name, "unary"> {
    return Object.freeze({
      contract: <Input, Success, Err>() =>
        createIntent<BoundaryId, Name, Input, Success, Err, "unary">(id, name, "unary"),
    });
  }

  function stream<Name extends string>(
    name: Name
  ): IntentContractDeclarator<BoundaryId, Name, "stream"> {
    return Object.freeze({
      contract: <Input, Success, Err>() =>
        createIntent<BoundaryId, Name, Input, Success, Err, "stream">(id, name, "stream"),
    });
  }

  Object.freeze(intent);
  Object.freeze(stream);
  return Object.freeze({
    id,
    intent,
    stream,
    [FORMA_BOUNDARY_RUNTIME]: true,
  }) as unknown as Boundary<BoundaryId>;
}
