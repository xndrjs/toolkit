import type { KeyDictionary, MultiDictionary } from "./types.js";

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

/** ICU argument map for a single-namespace schema. */
export type SingleParams<Schema extends KeyDictionary> = {
  [K in keyof Schema]: unknown;
};

/** Rest args for `t()` — `never` params omit the third argument. */
export type ParamArgs<P> = [P] extends [never] ? [] : [params: P];
