import type { Expansion, QueryDefinition, ResolveEach } from "../../../ir";
import {
  projectableProjections,
  queryHasRedirectResolves,
  queryNeedsFailureProjection,
  resolveTargetIndex,
} from "../../../check/projection-graph";
import { ariFactoryName, executionContextTypeName, paramsTypeName } from "../naming";
import { emitManyProject, projectOnFnName } from "./emit-project-on";
import { type ResourceIndex } from "./shared";

/** Shared helper for `on failure set null` / `set error` edges. */
export function emitProjectEdgeHelper(): string {
  return [
    `  const projectEdge = (`,
    `    ari: any,`,
    `    onFailure: "setNull" | "setError",`,
    `  ): unknown => {`,
    `    const value = projectNode(ari);`,
    `    if (value !== undefined) return value;`,
    `    if (onFailure === "setNull") return null;`,
    `    return failures.get(ari.toString());`,
    `  };`,
  ].join("\n");
}

/** Synthetic many-expand so resolve-to-each reuses {@link emitManyProject}. */
function resolveEachAsExpansion(resolveEach: ResolveEach): Expansion {
  return {
    alias: "",
    target: null,
    multiplicity: "many",
    comprehension: {
      itemBinding: resolveEach.itemBinding,
      source: resolveEach.source,
      arms: resolveEach.arms,
    },
    onFailure: "throw",
    span: null,
  };
}

/** Indent continuation lines of a multi-line map/flatMap expression. */
function indentMultilineExpr(expr: string, indent: string): string {
  if (!expr.includes("\n")) return expr;
  return expr
    .split("\n")
    .map((line, i) => (i === 0 ? line : `${indent}${line}`))
    .join("\n");
}

export function emitProjectNode(
  query: QueryDefinition,
  resources: ResourceIndex,
  fnName: string
): string {
  void resources;
  const projectable = projectableProjections(query);
  const resolveTargets = resolveTargetIndex(query);

  const cases: string[] = [];

  for (const projection of projectable) {
    const helper = projectOnFnName(projection.resource);
    cases.push(
      [
        `      case ${JSON.stringify(projection.resource)}:`,
        `        return ${helper}(ari, payload);`,
      ].join("\n")
    );
  }

  for (const [locator, info] of resolveTargets) {
    if (info.multiplicity === "many") continue;
    cases.push(
      [
        `      case ${JSON.stringify(locator)}: {`,
        `        const canonical = args.redirects.get(ari.toString());`,
        `        if (canonical === undefined) return undefined;`,
        `        return projectNode(canonical);`,
        `      }`,
      ].join("\n")
    );
  }

  // Many-resolve: map locator payload through the each body (no redirects).
  for (const projection of query.projections) {
    if (projection.resolveEach === null) continue;
    const mapExpr = indentMultilineExpr(
      emitManyProject(resolveEachAsExpansion(projection.resolveEach)),
      "        "
    );
    cases.push(
      [
        `      case ${JSON.stringify(projection.resource)}: {`,
        `        const resource = ari;`,
        `        const result = ${mapExpr};`,
        `        memo.set(key, result);`,
        `        return result;`,
        `      }`,
      ].join("\n")
    );
  }

  cases.push(
    [
      `      default:`,
      `        throw new Error(`,
      `          ${JSON.stringify(`${fnName}: unexpected resource type `)} + JSON.stringify(ari.type)`,
      `        );`,
    ].join("\n")
  );

  return [
    `  const projectNode = (ari: any): unknown => {`,
    `    const key = ari.toString();`,
    `    if (memo.has(key)) return memo.get(key);`,
    `    const payload = contentMap.get(ari as never);`,
    `    if (payload === undefined) return undefined;`,
    `    switch (ari.type) {`,
    cases.join("\n"),
    `    }`,
    `  };`,
  ].join("\n");
}

export function emitArgsType(query: QueryDefinition): string | null {
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;
  const hasRedirects = queryHasRedirectResolves(query);
  const hasFailures = queryNeedsFailureProjection(query);
  if (!hasParams && !hasContext && !hasRedirects && !hasFailures) {
    return null;
  }

  const fields: string[] = [];
  if (hasParams) {
    fields.push(`    params: ${paramsTypeName(query.name)};`);
  }
  if (hasContext) {
    fields.push(`    executionContext: ${executionContextTypeName(query.name)};`);
  }
  if (hasRedirects) {
    fields.push(`    redirects: ReadonlyMap<ResourceKey, ApplicationResourceIdentifier>;`);
  }
  if (hasFailures) {
    fields.push(`    failures: ReadonlyMap<ResourceKey, ResolutionError>;`);
  }
  return `{\n${fields.join("\n")}\n  }`;
}

export function emitRootsParamType(query: QueryDefinition): string {
  const fields: string[] = [];
  for (const root of query.roots) {
    if (root.alias === null) {
      throw new Error(`emitProjections: multi-root query '${query.name}' has a null alias`);
    }
    const ari = ariFactoryName(root.construction.resource);
    fields.push(`    ${root.alias}: ReturnType<typeof ${ari}>;`);
  }
  return `{\n${fields.join("\n")}\n  }`;
}

export function emitMultiRootReturn(query: QueryDefinition, resultType: string): string {
  const fields: string[] = [];
  for (const root of query.roots) {
    if (root.alias === null) {
      throw new Error(`emitProjections: multi-root query '${query.name}' has a null alias`);
    }
    fields.push(`    ${root.alias}: projectNode(roots.${root.alias}),`);
  }
  return `  return {\n${fields.join("\n")}\n  } as ${resultType};`;
}
