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
  /** Attach a realization: optional `using` / `perContext`, then `with(({ deps?, lifetime }) => …)`. */
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
 * After `intent(name)`, apply the contract type arguments via `.contract`.
 *
 * Name is taken as a value first so TypeScript keeps the string literal; contract
 * types are supplied on `.contract<Input, Success, Err>()`. A single call
 * `intent<Input, Success, Err>(name)` cannot infer `Name` once the earlier type
 * arguments are explicit (TypeScript does not do partial type inference).
 */
export type IntentContractDeclarator<BoundaryId extends string, Name extends string> = {
  contract<Input, Success, Err>(): Intent<BoundaryId, Name, Input, Success, Err>;
};

/**
 * Declare an Intent and its contract (`Input`, `Success`, expected `Error`).
 *
 * ```ts
 * Orders.intent("find").contract<OrderId, Order, FindError>();
 * ```
 */
export type IntentDeclarator<BoundaryId extends string> = <Name extends string>(
  name: Name
) => IntentContractDeclarator<BoundaryId, Name>;

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
  function intent<Name extends string>(name: Name): IntentContractDeclarator<BoundaryId, Name> {
    return {
      contract: <Input, Success, Err>() =>
        createIntent<BoundaryId, Name, Input, Success, Err>(id, name),
    };
  }

  return { id, intent };
}
