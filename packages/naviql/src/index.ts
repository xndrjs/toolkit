/**
 * Product entry for NaviQL: re-exports the resource graph resolver and
 * application-resources (browser-safe runtime façade).
 *
 * For IR, `checkProgram`, and (later) parse/codegen, use `@xndrjs/naviql/compile`.
 */
export * from "@xndrjs/resource-graph-resolver";
export {
  ari,
  AriKeySchemaError,
  AriParseError,
  s,
  safeParse,
  applicationResourceKeySchema,
  omitNullKeyFields,
  formatKeySchemaIssues,
  parseStableStringifyResource,
  safeParseStableStringifyResource,
  stableStringifyResource,
  type AriFactory,
  type AriKeySchema,
  type AnyKeySchema,
  type InferKeySchema,
  type KeySchemaIssue,
  type KeySchemaParseResult,
  type LeafSchema,
  type TupleSchema,
  type WireKeySchema,
  type StableStringifyResource,
  type ApplicationResourceKey,
  type ApplicationResourceKeyObject,
  type ApplicationResourceKeyPart,
  type ApplicationResourcePrimitive,
} from "@xndrjs/application-resources";
// `ApplicationResourceIdentifier` is already re-exported by resource-graph-resolver.
