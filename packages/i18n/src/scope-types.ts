import type { MultiDictionary } from "./types.js";

/** ICU argument map for a multi-namespace schema. */
export type MultiParams<Schema extends MultiDictionary> = {
  [NS in keyof Schema]: { [K in keyof Schema[NS]]: unknown };
};

/** Restrict a multi schema to a subset of namespaces. */
export type SchemaForNamespaces<
  Schema extends MultiDictionary,
  NsList extends readonly (keyof Schema & string)[],
> = Pick<Schema, NsList[number]>;

/** Restrict multi ICU params to a subset of namespaces. */
export type ParamsForNamespaces<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  NsList extends readonly (keyof Schema & string)[],
> = Pick<Params, NsList[number]>;

/** Rest args for `t()` — `never` params omit the third argument. */
export type ParamArgs<P> = [P] extends [never] ? [] : [params: P];

/**
 * Namespace-bound `t(key, …)` — locale already bound.
 * Call sites omit the namespace argument.
 */
export type NamespaceBoundTranslateFn<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  NS extends keyof Schema & keyof Params & string,
> = <const K extends keyof Schema[NS] & keyof Params[NS] & string>(
  key: K,
  ...params: ParamArgs<Params[NS][K]>
) => string;
