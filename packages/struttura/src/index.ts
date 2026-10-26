export {
  defineStructure,
  array,
  isDepSlot,
  resolveDepSlot,
  FILENAME_PATTERN,
  isValidFilename,
  DESTINATION,
  RESERVED_INSTANCE_KEYS,
  readDestination,
  type Structure,
  type StructureBuilder,
  type AnyConstructDefinition,
  type ArtifactCallback,
  type ArtifactCallbackContext,
  type ArtifactCallbackContextBase,
  type ArtifactRefsFromDescriptors,
  type ConstructDefinition,
  type ConstructDepsOf,
  type DeclaredDep,
  type DeclaredDepMap,
  type DepConstructOf,
  type DepInstances,
  type DepSlotMany,
  type DepSlotSingle,
  type InPlacement,
  type InstanceArtifacts,
  type InstanceDependencyValue,
  type InstanceRef,
  type IsManyDep,
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
} from "./structure/define-structure";

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
} from "./structure/artifacts";

export {
  createPopulation,
  flattenDependencyRefs,
  type CreatePopulationOptions,
  type PopulateDependency,
  type Population,
  type RegisteredInstance,
} from "./population/create-population";

export {
  computeDefinitionStamp,
  constructsFromStructure,
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
  prune,
  type PruneFailure,
  type PruneOptions,
  type PruneResult,
  type PruneSuccess,
} from "./apply/prune";

export {
  MANIFEST_RELATIVE_PATH,
  MANIFEST_VERSION,
  artifactIdentity,
  buildManifest,
  computeZombies,
  manifestPath,
  readManifest,
  trackedManifestArtifacts,
  writeManifest,
  type Manifest,
  type ManifestArtifact,
  type ManifestInstance,
} from "./apply/manifest";

export {
  MOVE_TEMP_ROOT,
  moveTempPath,
  planApply,
  type PlanApplyOptions,
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
