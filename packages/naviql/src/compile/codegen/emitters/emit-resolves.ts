/**
 * Emit high-level `resolve*` façades: closed strategy → resolve → project.
 *
 * Apps pass resolver config minus `strategy`, plus `resolve` input and query
 * params. Strategy factories and projectors stay exported for low-level use.
 */
import type { Program, QueryDefinition } from "../../../ir";
import {
  ariFactoryName,
  executionContextTypeName,
  paramsTypeName,
  projectFnName,
  queryResultTypeName,
  resolveFnName,
  resolveResultFieldName,
  resolveResultTypeName,
  strategyFactoryName,
} from "../naming";

function resolveInputTypeName(queryName: string): string {
  return `Resolve${queryName}Input`;
}

function emitResolveResultType(
  query: QueryDefinition,
  registryTypeName: string,
  resultField: string
): string {
  const typeName = resolveResultTypeName(query.name);
  const aggregateType = queryResultTypeName(query.name);
  return [
    `export type ${typeName} = {`,
    `  ${resultField}: ${aggregateType};`,
    `  contentMap: ContentMap<${registryTypeName}>;`,
    `  islands: IslandMap;`,
    `  islandDependencies: IslandDependencyMap;`,
    `  errors: readonly ResolutionError[];`,
    `  promotedResourceKeys: readonly ResourceKey[];`,
    `};`,
  ].join("\n");
}

function emitResolveInputType(query: QueryDefinition, registryTypeName: string): string {
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;
  const rootAri = ariFactoryName(query.root.resource);
  const contextType = hasContext ? executionContextTypeName(query.name) : "unknown";

  const fields: string[] = [];
  if (hasParams) {
    fields.push(`  params: ${paramsTypeName(query.name)};`);
  }
  fields.push(
    `  sources: readonly DataSource<${registryTypeName}, ${contextType}>[];`,
    `  schedulingMode?: SchedulingMode;`,
    `  observer?: ResolutionObserver;`,
    `  root: ReturnType<typeof ${rootAri}>;`,
    `  executionContext: ${contextType};`,
    `  missingResourceMode: MissingResourceMode;`,
    `  backingResources?: ReadonlyMap<ResourceKey, unknown>;`,
    `  signal?: AbortSignal;`
  );

  return `export type ${resolveInputTypeName(query.name)} = {\n${fields.join("\n")}\n};`;
}

function emitQueryResolve(query: QueryDefinition, registryTypeName: string): string {
  const fnName = resolveFnName(query.name);
  const resultType = resolveResultTypeName(query.name);
  const inputType = resolveInputTypeName(query.name);
  const resultField = resolveResultFieldName(query.name);
  const strategyFactory = strategyFactoryName(query.name);
  const projectFn = projectFnName(query.name);
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;
  const contextType = hasContext ? executionContextTypeName(query.name) : "unknown";

  const strategyCall = hasParams
    ? `${strategyFactory}(input.params).build()`
    : `${strategyFactory}().build()`;

  let projectCall = `${projectFn}(input.root, contentMap)`;
  if (hasParams || hasContext) {
    const argFields: string[] = [];
    if (hasParams) {
      argFields.push("params: input.params");
    }
    if (hasContext) {
      argFields.push("executionContext: input.executionContext");
    }
    projectCall = `${projectFn}(input.root, contentMap, {\n    ${argFields.join(",\n    ")},\n  })`;
  }

  return [
    emitResolveInputType(query, registryTypeName),
    "",
    emitResolveResultType(query, registryTypeName, resultField),
    "",
    `export async function ${fnName}(`,
    `  input: ${inputType},`,
    `): Promise<${resultType}> {`,
    `  const resolver = createResourceGraphResolver<${registryTypeName}, ${contextType}>({`,
    `    sources: input.sources,`,
    `    strategy: ${strategyCall},`,
    `    schedulingMode: input.schedulingMode,`,
    `    observer: input.observer,`,
    `  });`,
    ``,
    `  const {`,
    `    contentMap,`,
    `    islands,`,
    `    islandDependencies,`,
    `    errors,`,
    `    promotedResourceKeys,`,
    `  } = await resolver.resolve({`,
    `    root: input.root,`,
    `    executionContext: input.executionContext,`,
    `    missingResourceMode: input.missingResourceMode,`,
    `    backingResources: input.backingResources,`,
    `    signal: input.signal,`,
    `  });`,
    ``,
    `  const ${resultField} = ${projectCall};`,
    ``,
    `  return {`,
    `    ${resultField},`,
    `    contentMap,`,
    `    islands,`,
    `    islandDependencies,`,
    `    errors,`,
    `    promotedResourceKeys,`,
    `  };`,
    `}`,
  ].join("\n");
}

/**
 * Emit `resolve*` façades for each query.
 * Returns an empty string when the program has no queries.
 *
 * Strategy factories and projectors are assumed to already exist in the module.
 *
 * @param registryTypeName - Registry generic (default `ContentRegistry`).
 */
export function emitResolves(program: Program, registryTypeName = "ContentRegistry"): string {
  if (program.queries.length === 0) {
    return "";
  }

  return program.queries.map((query) => emitQueryResolve(query, registryTypeName)).join("\n\n");
}
