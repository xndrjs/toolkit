/**
 * Emit high-level `resolve*` façades: closed strategy → resolve → project.
 *
 * Apps pass resolver config minus `strategy`, plus query params and
 * `executionContext`. Root ARIs are built inside the façade from the query’s
 * `root` / `roots` constructions (params + context) — callers do not pass them.
 *
 * Strategy factories and projectors stay exported for low-level use.
 */
import type { Program, QueryDefinition } from "../../../ir";
import { isSingleRootQuery } from "../../../ir";
import { queryNeedsFailureProjection } from "../../../check/projection-graph";
import {
  executionContextTypeName,
  paramsTypeName,
  projectFnName,
  queryResultTypeName,
  resolveFnName,
  resolveResultFieldName,
  resolveResultTypeName,
  strategyFactoryName,
} from "../naming";
import { emitConstruction } from "../shared/emit-construction";
import type { EmitExprScope } from "../shared/emit-expr";

/** Scope for root constructions inside `resolve*`: params + executionContext on `input`. */
const resolveFacadeExprScope: EmitExprScope = {
  params: "input.params",
  executionContext: "input.executionContext",
  payload: "payload",
  resource: "resource",
};

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
  const contextType = hasContext ? executionContextTypeName(query.name) : "unknown";

  const fields: string[] = [];
  if (hasParams) {
    fields.push(`  params: ${paramsTypeName(query.name)};`);
  }
  fields.push(
    `  sources: readonly DataSource<${registryTypeName}, ${contextType}>[];`,
    `  schedulingMode?: SchedulingMode;`,
    `  budget?: ResolutionBudgetOptions;`,
    `  observer?: ResolutionObserver;`,
    `  executionContext: ${contextType};`,
    `  backingResources?: ReadonlyMap<ResourceKey, unknown>;`,
    `  signal?: AbortSignal;`
  );

  return `export type ${resolveInputTypeName(query.name)} = {\n${fields.join("\n")}\n};`;
}

/** Bind locals `root` / `roots` from the query’s constructions. */
function emitRootBindings(query: QueryDefinition): string[] {
  if (isSingleRootQuery(query)) {
    const construction = emitConstruction(query.roots[0]!.construction, resolveFacadeExprScope);
    return [`  const root = ${construction};`];
  }

  const entries: string[] = [];
  for (const root of query.roots) {
    if (root.alias === null) {
      throw new Error(`emitResolves: multi-root query '${query.name}' has a null alias`);
    }
    const construction = emitConstruction(root.construction, resolveFacadeExprScope);
    entries.push(`    ${root.alias}: ${construction},`);
  }
  return [`  const roots = {`, ...entries, `  };`];
}

function emitEngineRootsExpr(query: QueryDefinition): string {
  if (isSingleRootQuery(query)) {
    return `[root]`;
  }
  const parts: string[] = [];
  for (const root of query.roots) {
    if (root.alias === null) {
      throw new Error(`emitResolves: multi-root query '${query.name}' has a null alias`);
    }
    parts.push(`roots.${root.alias}`);
  }
  return `[${parts.join(", ")}]`;
}

function emitProjectCall(query: QueryDefinition): string {
  const projectFn = projectFnName(query.name);
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;
  const hasRedirects = query.projections.some((p) => p.resolveArms !== null);
  const hasFailures = queryNeedsFailureProjection(query);
  const seedArg = isSingleRootQuery(query) ? "root" : "roots";

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
  const hasRedirects = query.projections.some((p) => p.resolveArms !== null);
  const hasFailures = queryNeedsFailureProjection(query);
  const contextType = hasContext ? executionContextTypeName(query.name) : "unknown";

  const strategyCall = hasParams
    ? `${strategyFactory}(input.params).build()`
    : `${strategyFactory}().build()`;

  const projectCall = emitProjectCall(query);
  const engineRoots = emitEngineRootsExpr(query);
  const rootBindings = emitRootBindings(query);
  const outputBindings = [
    `    contentMap,`,
    `    islands,`,
    `    islandDependencies,`,
    `    errors,`,
    ...(hasFailures ? [`    failures,`] : []),
    `    promotedResourceKeys,`,
    ...(hasRedirects ? [`    redirects,`] : []),
  ];

  return [
    emitResolveInputType(query, registryTypeName),
    "",
    emitResolveResultType(query, registryTypeName, resultField),
    "",
    `export async function ${fnName}(`,
    `  input: ${inputType},`,
    `): Promise<${resultType}> {`,
    ...rootBindings,
    `  const resolver = createResourceGraphResolver<${registryTypeName}, ${contextType}>({`,
    `    sources: input.sources,`,
    `    strategy: ${strategyCall},`,
    `    schedulingMode: input.schedulingMode,`,
    `    budget: input.budget,`,
    `    observer: input.observer,`,
    `  });`,
    ``,
    `  const {`,
    ...outputBindings,
    `  } = await resolver.resolve({`,
    `    roots: ${engineRoots},`,
    `    executionContext: input.executionContext,`,
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
