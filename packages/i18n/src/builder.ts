import type { DeliveryArtifactsMap } from "./builder-types.js";
import { I18nBuilderMultiImpl, type I18nBuilderMultiOptions } from "./builder-multi.js";
import { I18nBuilderSingleImpl, type I18nBuilderSingleOptions } from "./single-builder.js";
import type { I18nEngineMultiImpl, I18nEngineSingleImpl } from "./engine.js";
import type { KeyDictionary, LocaleOfMulti, LocaleOfSingle, MultiDictionary } from "./types.js";
import type { MultiParams } from "./scope-types.js";

export type { CanonicalLoader, NamespaceLoader, PartitionedLoader } from "./builder-loaders.js";
export { invokeNamespaceLoader } from "./builder-loaders.js";
export type {
  I18nBuilderMulti,
  I18nBuilderMultiForLocale,
  I18nBuilderMultiOptions,
  I18nBuilderMultiPartitioned,
} from "./builder-multi.js";
export type {
  I18nBuilderSingle,
  I18nBuilderSingleForLocale,
  I18nBuilderSingleOptions,
} from "./single-builder.js";

type AnySingleEngine = I18nEngineSingleImpl<KeyDictionary, { [K in keyof KeyDictionary]: unknown }>;
type AnyMultiEngine = I18nEngineMultiImpl<MultiDictionary, MultiParams<MultiDictionary>>;

function isMultiEngine(engine: AnySingleEngine | AnyMultiEngine): engine is AnyMultiEngine {
  return engine.__i18nEngineMode === "multi";
}

export function createI18nSingleBuilder<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
>(
  engine: I18nEngineSingleImpl<Schema, Params, RequestLocales>,
  options?: I18nBuilderSingleOptions<Schema, RequestLocales>
): I18nBuilderSingleImpl<Schema, Params, RequestLocales> {
  return new I18nBuilderSingleImpl(engine, options);
}

export function createI18nMultiBuilder<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
  DeliveryArea extends string = never,
  DeliveryArtifacts extends DeliveryArtifactsMap<RequestLocales, DeliveryArea> =
    DeliveryArtifactsMap<RequestLocales, DeliveryArea>,
>(
  engine: I18nEngineMultiImpl<Schema, Params, RequestLocales>,
  options?: I18nBuilderMultiOptions<Schema, RequestLocales>
): I18nBuilderMultiImpl<
  Schema,
  Params,
  RequestLocales,
  RequestLocales,
  readonly [],
  DeliveryArea,
  DeliveryArtifacts
> {
  return new I18nBuilderMultiImpl<
    Schema,
    Params,
    RequestLocales,
    RequestLocales,
    readonly [],
    DeliveryArea,
    DeliveryArtifacts
  >(engine, options);
}

export function createI18nBuilder<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
>(
  engine: I18nEngineMultiImpl<Schema, Params, RequestLocales>,
  options?: I18nBuilderMultiOptions<Schema, RequestLocales>
): I18nBuilderMultiImpl<
  Schema,
  Params,
  RequestLocales,
  RequestLocales,
  readonly [],
  never,
  DeliveryArtifactsMap<RequestLocales, never>
>;

export function createI18nBuilder<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
>(
  engine: I18nEngineSingleImpl<Schema, Params, RequestLocales>,
  options?: I18nBuilderSingleOptions<Schema, RequestLocales>
): I18nBuilderSingleImpl<Schema, Params, RequestLocales>;

export function createI18nBuilder(
  engine: AnySingleEngine | AnyMultiEngine,
  options?:
    | I18nBuilderMultiOptions<MultiDictionary, string>
    | I18nBuilderSingleOptions<KeyDictionary, string>
): never {
  if (isMultiEngine(engine)) {
    return createI18nMultiBuilder(
      engine,
      options as I18nBuilderMultiOptions<MultiDictionary, string> | undefined
    ) as never;
  }

  return createI18nSingleBuilder(
    engine,
    options as I18nBuilderSingleOptions<KeyDictionary, string> | undefined
  ) as never;
}
