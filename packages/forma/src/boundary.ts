import { createProvideApi, type ProvideApi } from "./provider.js";

declare const formaIntentBrand: unique symbol;

/**
 * Declared intention within a Boundary: stable nominal identity + contract,
 * independent of how it is fulfilled.
 *
 * - **Boundary brand** (`BoundaryId`): same-boundary `using` checks (ticket 02+).
 * - **Nominal identity** (`Name` + runtime `identity` symbol): structurally
 *   identical contracts are not the same Intent.
 */
export type Intent<BoundaryId extends string, Name extends string, Input, Success, Err> = {
  readonly boundaryId: BoundaryId;
  readonly name: Name;
  /** Runtime nominal identity (composition resolves by this). */
  readonly identity: symbol;
  /** Attach a realization: optional `using` / `perContext`, then `with(factory)`. */
  readonly provide: ProvideApi<BoundaryId, Name, Input, Success, Err>;
  readonly [formaIntentBrand]: {
    readonly boundary: BoundaryId;
    readonly name: Name;
    readonly input: Input;
    readonly success: Success;
    readonly error: Err;
  };
};

/**
 * Declare an Intent and its contract (`Input`, `Success`, expected `Error`).
 *
 * ```ts
 * // Plan / common form (name widens to string in the Intent type):
 * Orders.intent<OrderId, Order, FindError>("find");
 *
 * // Nominal form — preserves literal name so same-contract Intents stay distinct:
 * Orders.intent<OrderId, Order, FindError>()("find");
 * ```
 *
 * The curried form exists because TypeScript cannot infer a remaining type
 * parameter (`Name`) after earlier type arguments are supplied in one call.
 */
export type IntentDeclarator<BoundaryId extends string> = {
  <Input, Success, Err, Name extends string = string>(
    name: Name
  ): Intent<BoundaryId, Name, Input, Success, Err>;
  <Input, Success, Err>(): <Name extends string>(
    name: Name
  ) => Intent<BoundaryId, Name, Input, Success, Err>;
};

export type Boundary<BoundaryId extends string> = {
  readonly id: BoundaryId;
  readonly intent: IntentDeclarator<BoundaryId>;
};

function createIntent<BoundaryId extends string, Name extends string, Input, Success, Err>(
  boundaryId: BoundaryId,
  name: Name
): Intent<BoundaryId, Name, Input, Success, Err> {
  const intent = {
    boundaryId,
    name,
    identity: Symbol(`${boundaryId}.${name}`),
  } as Intent<BoundaryId, Name, Input, Success, Err>;

  // Assign after the object exists so the builder closes over the Intent value.
  (intent as { provide: ProvideApi<BoundaryId, Name, Input, Success, Err> }).provide =
    createProvideApi(intent);

  return intent;
}

/** Create an isolated architectural space and namespace for Intent identities. */
export function boundary<const BoundaryId extends string>(id: BoundaryId): Boundary<BoundaryId> {
  function intent<Input, Success, Err, Name extends string>(
    name: Name
  ): Intent<BoundaryId, Name, Input, Success, Err>;
  function intent<Input, Success, Err>(): <Name extends string>(
    name: Name
  ) => Intent<BoundaryId, Name, Input, Success, Err>;
  function intent<Input, Success, Err, Name extends string>(
    name?: Name
  ):
    | Intent<BoundaryId, Name, Input, Success, Err>
    | (<N extends string>(name: N) => Intent<BoundaryId, N, Input, Success, Err>) {
    if (name !== undefined) {
      return createIntent<BoundaryId, Name, Input, Success, Err>(id, name);
    }
    return <N extends string>(intentName: N) =>
      createIntent<BoundaryId, N, Input, Success, Err>(id, intentName);
  }

  return { id, intent };
}
