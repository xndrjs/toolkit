/**
 * Value type produced by a domain kit:
 * - primitive / shape kits: return type of `create`
 * - proof kits: narrowed branded value asserted by `test`
 */
export type KitInstance<Kit> = Kit extends { create: infer Create }
  ? Create extends (...args: never[]) => infer Created
    ? Created
    : never
  : Kit extends { test: (value: unknown) => value is infer Proved }
    ? Proved
    : never;
