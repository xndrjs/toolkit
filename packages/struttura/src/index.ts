export {
  defineArchitecture,
  FILENAME_PATTERN,
  isValidFilename,
  DESTINATION,
  RESERVED_INSTANCE_KEYS,
  readDestination,
  type Architecture,
  type ArchitectureBuilder,
  type AnyConstructDefinition,
  type ArtifactCallback,
  type ArtifactCallbackContext,
  type ArtifactCallbackContextBase,
  type ArtifactRefsFromDescriptors,
  type ConstructDefinition,
  type InPlacement,
  type InstanceArtifacts,
  type InstanceRef,
  type NavigableFromNode,
  type NavigableFromPlacement,
  type NavigableFromRoot,
  type NavigableInstanceRef,
  type PlacementDestination,
  type PlacementRoot,
  type ReservedInstanceKey,
  type TreeBuildCallback,
  type TreeCallbackContextFor,
  type TreeDirNode,
  type TreeFileNode,
  type TreeNode,
} from "./architecture/define-architecture";

export type {
  ArtifactDescriptor,
  ArtifactDirRef,
  DirDescriptor,
  DirectoryRefInput,
  DirRef,
  FileContentFn,
  FileDescriptor,
  FileMode,
  FileOptions,
  FileRef,
  RootRef,
} from "./architecture/artifacts";

export {
  createPopulation,
  type CreatePopulationOptions,
  type PopulateDependency,
  type Population,
  type RegisteredInstance,
} from "./population/create-population";

export {
  computeDefinitionStamp,
  constructsFromArchitecture,
  emitPopulateApi,
  navigableShapeFromKinds,
  probeArtifactKinds,
  probeNavigableShapes,
  type ArtifactKind,
  type EmitPopulateApiOptions,
  type EmitPopulateApiResult,
  type NavigableChildShape,
  type NavigableRootShape,
} from "./codegen/emit-populate-api";

export { checkDefinitionStamp } from "./codegen/check-stamp";

export {
  deriveDesiredInventory,
  type DesiredArtifact,
  type DesiredInventory,
  type DeriveResult,
  type Diagnostic,
  type DiagnosticCode,
} from "./inventory/derive-desired-inventory";

export {
  apply,
  type ApplyFailure,
  type ApplyOptions,
  type ApplyResult,
  type ApplySuccess,
} from "./apply/apply";

export {
  MANIFEST_RELATIVE_PATH,
  MANIFEST_VERSION,
  buildManifest,
  manifestPath,
  readManifest,
  writeManifest,
  type Manifest,
  type ManifestArtifact,
  type ManifestInstance,
} from "./apply/manifest";

export {
  MOVE_TEMP_ROOT,
  moveTempPath,
  planApply,
  type PlanOp,
  type PlanResult,
} from "./apply/plan";

export type { FileRenderContext, FilesInOptions } from "./apply/render-contents";

export {
  inspect,
  type InspectArtifactView,
  type InspectFailure,
  type InspectOptions,
  type InspectReport,
  type InspectResult,
  type InspectSuccess,
} from "./inspect/inspect";

export {
  migrateId,
  rewriteManifestIds,
  type MigrateIdDiagnostic,
  type MigrateIdDiagnosticCode,
  type MigrateIdFailure,
  type MigrateIdOptions,
  type MigrateIdResult,
  type MigrateIdSuccess,
} from "./cli/migrate-id";

export { runCli } from "./cli/run";
export { parseCliArgs, printCliHelp, type CliOptions } from "./cli/args";

export {
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSentenceCase,
  toSnakeCase,
  toTitleCase,
  words,
} from "./casing/casing";

export {
  relativeTsModule,
  renderTsBarrel,
  tsBarrelIndex,
  type TsBarrelIndexOptions,
} from "./ts/barrel";
