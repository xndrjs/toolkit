export {
  defineArchitecture,
  dir,
  file,
  root,
  FILENAME_PATTERN,
  isValidFilename,
  type Architecture,
  type ArchitectureBuilder,
  type ArtifactCallback,
  type ArtifactCallbackContext,
  type ConstructDefinition,
  type InstanceArtifacts,
  type InstanceRef,
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
  FileRef,
  RootRef,
} from "./architecture/artifacts";

export {
  createPopulation,
  type Population,
  type RegisteredInstance,
} from "./population/create-population";

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

export { planApply, type PlanOp, type PlanResult } from "./apply/plan";

export {
  toCamelCase,
  toKebabCase,
  toPascalCase,
  toSentenceCase,
  toSnakeCase,
  toTitleCase,
  words,
} from "./casing/casing";
