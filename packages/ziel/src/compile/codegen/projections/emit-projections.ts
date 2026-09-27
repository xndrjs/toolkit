/**
 * Emit memoized `project*` materializers from checked queries.
 *
 * Restores expansion aliases over a resolved `ContentMap`, stamps `$type`
 * discriminators, and memos by `ari.toString()` with shell-before-edges
 * (cycle-safe). Union / collection expansion targets are stripped to member
 * projections (no `on EditorialModule` / `on TabCollection` required).
 * Resolve-only `on R resolve to` is not a `projectOn*` shell — settled payload
 * under the locator key is stripped via resolve targets (same as resourceRef unions).
 * Armed `on` projections discriminate on payload `type` and build variant shells.
 */
import type { Program, QueryDefinition } from "../../../ir";
import { isSingleRootQuery } from "../../../ir";
import { ariFactoryName, projectFnName, queryResultTypeName } from "../naming";
import {
  collectionElementResources,
  emitArgsType,
  emitMultiRootReturn,
  emitProjectNode,
  emitRootsParamType,
} from "./emit-project-node";
import { projectableProjections } from "../../../check/projection-graph";
import { emitProjectOnHelper } from "./emit-project-on";
import { resourceIndex, type ResourceIndex } from "./shared";

function emitQueryProjection(
  query: QueryDefinition,
  resources: ResourceIndex,
  registryTypeName: string
): string {
  const fnName = projectFnName(query.name);
  const resultType = queryResultTypeName(query.name);
  const singleRoot = isSingleRootQuery(query);
  const argsType = emitArgsType(query);

  const rootParam = singleRoot
    ? `root: ReturnType<typeof ${ariFactoryName(query.roots[0]!.construction.resource)}>`
    : `roots: ${emitRootsParamType(query)}`;

  const sigParams = [rootParam, `contentMap: ContentMap<${registryTypeName}>`];
  if (argsType !== null) {
    sigParams.push(`args: ${argsType}`);
  }

  const embedded = collectionElementResources(query, resources);
  const contextFieldNames = new Set(query.context.map((f) => f.name));
  const helpers: string[] = [];

  for (const projection of projectableProjections(query)) {
    helpers.push(emitProjectOnHelper(projection, resources, query.name, contextFieldNames));
  }

  // Collection elements must have an `on` projection (projected via ContentMap).
  for (const element of embedded) {
    if (!query.projections.some((p) => p.resource === element && p.resolveArms === null)) {
      throw new Error(
        `emitProjections: query '${query.name}' expands collection element '${element}' but has no 'on ${element}' projection`
      );
    }
  }

  const projectNode = emitProjectNode(query, resources, fnName);
  const returnStmt = singleRoot
    ? `  return projectNode(root) as ${resultType};`
    : emitMultiRootReturn(query, resultType);

  const body = [
    `  const memo = new Map<string, object>();`,
    "",
    helpers.join("\n\n"),
    "",
    projectNode,
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
 */
export function emitProjections(program: Program, registryTypeName = "ContentRegistry"): string {
  if (program.queries.length === 0) {
    return "";
  }

  const resources = resourceIndex(program);
  return program.queries
    .map((query) => emitQueryProjection(query, resources, registryTypeName))
    .join("\n\n");
}
