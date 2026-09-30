/**
 * Emit memoized `project*` materializers from checked queries.
 *
 * Restores expansion aliases over a resolved `ContentMap` and memos by
 * `ari.toString()` with shell-before-edges (cycle-safe).
 * Resource-union payloads (`EditorialModule: Hero | Tabs`) require an explicit
 * `on EditorialModule` — indirection to member resources uses `resolve to`,
 * same as CustomReference.
 * Resolve-only `on R resolve to` is not a `projectOn*` shell — 1→1 strips via
 * redirects; resolve-to-each maps locator payload through `projectNode` /
 * `projectEdge` (no redirect entry).
 * Armed `on` projections discriminate on payload fields and build variant shells.
 * Optional `resourceTag` stamps the resource name onto each shell (off by default).
 */
import type { ProgramAnalysis, QueryPlan } from "../../../check";
import { isSingleRootQuery } from "../../../ir";
import { codegenAnalysis, type CodegenInput } from "../analysis";
import { ariFactoryName, projectFnName, queryResultTypeName } from "../naming";
import {
  emitArgsType,
  emitMultiRootReturn,
  emitProjectEdgeHelper,
  emitProjectNode,
  emitRootsParamType,
} from "./emit-project-node";
import { emitProjectOnHelper } from "./emit-project-on";
import { type ResourceIndex } from "./shared";

function emitQueryProjection(
  plan: QueryPlan,
  resources: ResourceIndex,
  registryTypeName: string,
  resourceTag?: string
): string {
  const query = plan.query;
  const fnName = projectFnName(query.name);
  const resultType = queryResultTypeName(query.name);
  const singleRoot = isSingleRootQuery(query);
  const argsType = emitArgsType(plan);
  const needsFailures = plan.needsFailureProjection;

  const rootParam = singleRoot
    ? `root: ReturnType<typeof ${ariFactoryName(query.roots[0]!.construction.resource)}>`
    : `roots: ${emitRootsParamType(query)}`;

  const sigParams = [rootParam, `contentMap: ContentMap<${registryTypeName}>`];
  if (argsType !== null) {
    sigParams.push(`args: ${argsType}`);
  }

  const helpers: string[] = [];

  for (const projection of plan.projectableProjections) {
    helpers.push(emitProjectOnHelper(projection, resources, query.name, resourceTag));
  }

  const projectNode = emitProjectNode(plan, resources, fnName);
  const projectEdge = needsFailures ? emitProjectEdgeHelper(fnName) : null;
  const failuresBinding = needsFailures ? `  const failures = args.failures;\n` : "";
  const returnStmt = singleRoot
    ? `  return projectNode(root) as ${resultType};`
    : emitMultiRootReturn(query, resultType);

  const body = [
    `  const memo = new Map<string, unknown>();`,
    failuresBinding,
    helpers.join("\n\n"),
    "",
    projectNode,
    projectEdge ? `\n${projectEdge}` : "",
    "",
    returnStmt,
  ].join("\n");

  return `export function ${fnName}(\n  ${sigParams.join(",\n  ")},\n): ${resultType} {\n${body}\n}`;
}

/**
 * Emit memoized `project*` functions for each query.
 * Returns an empty string when the program has no queries.
 *
 * Params / context types are assumed to already exist in the module (emitted by
 * {@link emitStrategies}); this function only emits the projectors.
 *
 * @param registryTypeName - Registry generic on `ContentMap` (default `ContentRegistry`).
 * @param resourceTag - Optional property name for a resource-name stamp on shells.
 */
export function emitProjections(
  input: CodegenInput,
  registryTypeName = "ContentRegistry",
  resourceTag?: string
): string {
  const analysis: ProgramAnalysis = codegenAnalysis(input);
  if (analysis.queries.length === 0) {
    return "";
  }

  return analysis.queries
    .map((query) => emitQueryProjection(query, analysis.resources, registryTypeName, resourceTag))
    .join("\n\n");
}
