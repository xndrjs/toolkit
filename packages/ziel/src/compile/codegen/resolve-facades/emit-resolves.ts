/**
 * Emit high-level `resolve*` façades: closed strategy → resolve → project.
 *
 * Apps pass resolver config minus `strategy`, plus `resolve` input and query
 * params. Strategy factories and projectors stay exported for low-level use.
 *
 * Single-root keeps ergonomic `root:`; multi-root takes `roots: { alias: ARI }`.
 * Both call `resolver.resolve({ roots: […] })`.
 */
import type { Program, QueryDefinition } from "../../../ir";
import { isSingleRootQuery } from "../../../ir";
import { queryNeedsFailureProjection } from "../../../check/projection-graph";
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

function emitMultiRootInputField(query: QueryDefinition): string {
  const fields: string[] = [];
  for (const root of query.roots) {
    if (root.alias === null) {
      throw new Error(`emitResolves: multi-root query '${query.name}' has a null alias`);
    }
    const ari = ariFactoryName(root.construction.resource);
    fields.push(`    ${root.alias}: ReturnType<typeof ${ari}>;`);
  }
  return `  roots: {\n${fields.join("\n")}\n  };`;
}

function emitResolveInputType(query: QueryDefinition, registryTypeName: string): string {
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;
  const singleRoot = isSingleRootQuery(query);
  const contextType = hasContext ? executionContextTypeName(query.name) : "unknown";

  const fields: string[] = [];
  if (hasParams) {
    fields.push(`  params: ${paramsTypeName(query.name)};`);
  }
  fields.push(
    `  sources: readonly DataSource<${registryTypeName}, ${contextType}>[];`,
    `  schedulingMode?: SchedulingMode;`,
    `  observer?: ResolutionObserver;`
  );
  if (singleRoot) {
    const rootAri = ariFactoryName(query.roots[0]!.construction.resource);
    fields.push(`  root: ReturnType<typeof ${rootAri}>;`);
  } else {
    fields.push(emitMultiRootInputField(query));
  }
  fields.push(
    `  executionContext: ${contextType};`,
    `  backingResources?: ReadonlyMap<ResourceKey, unknown>;`,
    `  signal?: AbortSignal;`
  );

  return `export type ${resolveInputTypeName(query.name)} = {\n${fields.join("\n")}\n};`;
}

function emitEngineRootsExpr(query: QueryDefinition): string {
  if (isSingleRootQuery(query)) {
    return `[input.root]`;
  }
  const parts: string[] = [];
  for (const root of query.roots) {
    if (root.alias === null) {
      throw new Error(`emitResolves: multi-root query '${query.name}' has a null alias`);
    }
    parts.push(`input.roots.${root.alias}`);
  }
  return `[${parts.join(", ")}]`;
}

function emitProjectCall(query: QueryDefinition): string {
  const projectFn = projectFnName(query.name);
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;
  const hasRedirects = query.projections.some((p) => p.resolveArms !== null);
  const hasFailures = queryNeedsFailureProjection(query);
  const seedArg = isSingleRootQuery(query) ? "input.root" : "input.roots";

  if (!hasParams && !hasContext && !hasRedirects && !hasFailures) {
    return `${projectFn}(${seedArg}, contentMap)`;
  }

  const argFields: string[] = [];
  if (hasParams) {
    argFields.push("params: input.params");
  }
  if (hasContext) {
    argFields.push("executionContext: input.executionContext");
  }
  if (hasRedirects) {
    argFields.push("redirects");
  }
  if (hasFailures) {
    argFields.push("failures");
  }
  return `${projectFn}(${seedArg}, contentMap, {\n    ${argFields.join(",\n    ")},\n  })`;
}

function emitQueryResolve(query: QueryDefinition, registryTypeName: string): string {
  const fnName = resolveFnName(query.name);
  const resultType = resolveResultTypeName(query.name);
  const inputType = resolveInputTypeName(query.name);
  const resultField = resolveResultFieldName(query.name);
  const strategyFactory = strategyFactoryName(query.name);
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;
  const hasFailures = queryNeedsFailureProjection(query);
  const contextType = hasContext ? executionContextTypeName(query.name) : "unknown";

  const strategyCall = hasParams
    ? `${strategyFactory}(input.params).build()`
    : `${strategyFactory}().build()`;

  const projectCall = emitProjectCall(query);
  const engineRoots = emitEngineRootsExpr(query);
  const failuresBinding = hasFailures
    ? [
        ``,
        `  const failures = new Map<ResourceKey, ResolutionError>();`,
        `  for (const error of errors) {`,
        `    if (error.resourceKey !== undefined) {`,
        `      failures.set(error.resourceKey, error);`,
        `    }`,
        `  }`,
        ``,
      ].join("\n")
    : `\n`;

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
    `    redirects,`,
    `  } = await resolver.resolve({`,
    `    roots: ${engineRoots},`,
    `    executionContext: input.executionContext,`,
    `    backingResources: input.backingResources,`,
    `    signal: input.signal,`,
    `  });`,
    failuresBinding,
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
