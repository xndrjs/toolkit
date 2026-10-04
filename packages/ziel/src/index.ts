/**
 * Product entry for Ziel: re-exports the resource graph resolver and
 * addressable-resources (browser-safe runtime façade), plus opaque-type helpers
 * used by generated modules and composition roots.
 *
 * For IR, `checkProgram`, `parseAndCheck`, and `generateResources`, use `@xndrjs/ziel/compile`.
 */
export * from "@xndrjs/resource-graph-resolver";
export {
  ari,
  AriKeySchemaError,
  AriParseError,
  s,
  safeParse,
  addressableResourceKeySchema,
  omitNullKeyFields,
  formatKeySchemaIssues,
  formatAriString,
  parseAriString,
  safeParseAriString,
  type AriFactory,
  type AriKeySchema,
  type AnyKeySchema,
  type InferKeySchema,
  type KeySchemaIssue,
  type KeySchemaParseResult,
  type LeafSchema,
  type ObjectSchema,
  type WireKeySchema,
  type ParsedAriString,
  type AddressableResourceKey,
  type AddressableResourcePrimitive,
} from "@xndrjs/addressable-resources";
// `AddressableResourceIdentifier` is already re-exported by resource-graph-resolver.
export {
  createOpaqueRegistry,
  defineOpaqueType,
  type Opaque,
  type OpaqueRegistry,
  type OpaqueType,
  type OpaqueValueOf,
} from "./opaque";
