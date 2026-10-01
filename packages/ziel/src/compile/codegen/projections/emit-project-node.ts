import type { QueryPlan } from "../../../analyze";
import type { QueryDefinition } from "../../../ir";
import { ariFactoryName, paramsTypeName, payloadTypeName } from "../naming";
import { emitManyProject, projectOnFnName } from "./emit-project-on";
import { type ResourceIndex } from "./resource-index";

/** Shared helper for `on failure set null` / `set error` edges. */
export function emitProjectEdgeHelper(fnName: string): string {
  return [
    `  const projectEdge = (`,
    `    ari: ApplicationResourceIdentifier,`,
    `    onFailure: "setNull" | "setError",`,
    `  ): unknown => {`,
    `    const value = projectNode(ari);`,
    `    if (value !== undefined) return value;`,
    `    if (onFailure === "setNull") return null;`,
    `    const failure = failures.get(ari.toString());`,
    `    if (failure === undefined) {`,
    `      throw new Error(`,
    `        ${JSON.stringify(`${fnName}: missing collected failure for `)} + ari.toString()`,
    `      );`,
    `    }`,
    `    return toResolutionErrorData(failure);`,
    `  };`,
  ].join("\n");
}

/** Indent continuation lines of a multi-line map/flatMap expression. */
function indentMultilineExpr(expr: string, indent: string): string {
  if (!expr.includes("\n")) return expr;
  return expr
    .split("\n")
    .map((line, i) => (i === 0 ? line : `${indent}${line}`))
    .join("\n");
}

export function emitProjectNode(plan: QueryPlan, resources: ResourceIndex, fnName: string): string {
  void resources;
  const cases: string[] = [];

  for (const projection of plan.projectableProjections) {
    const helper = projectOnFnName(projection.source.resource);
    const ari = ariFactoryName(projection.source.resource);
    const payloadType = payloadTypeName(projection.source.resource);
    cases.push(
      [
        `      case ${JSON.stringify(projection.source.resource)}:`,
        `        return ${helper}(ari as ReturnType<typeof ${ari}>, loadedPayload as ${payloadType});`,
      ].join("\n")
    );
  }

  for (const [locator, info] of plan.redirectTargets) {
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
  for (const projection of plan.projections) {
    if (projection.resolveEach === null) continue;
    const ari = ariFactoryName(projection.source.resource);
    const payload = payloadTypeName(projection.source.resource);
    const mapExpr = indentMultilineExpr(emitManyProject(projection.resolveEach.source), "        ");
    cases.push(
      [
        `      case ${JSON.stringify(projection.source.resource)}: {`,
        `        const resource = ari as ReturnType<typeof ${ari}>;`,
        `        const payload = loadedPayload as ${payload};`,
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
    `  const projectNode = (ari: ApplicationResourceIdentifier): unknown => {`,
    `    const key = ari.toString();`,
    `    if (memo.has(key)) return memo.get(key);`,
    `    const loadedPayload = contentMap.get(ari as never);`,
    `    if (loadedPayload === undefined) return undefined;`,
    `    switch (ari.type) {`,
    cases.join("\n"),
    `    }`,
    `  };`,
  ].join("\n");
}

export function emitArgsType(plan: QueryPlan): string | null {
  const query = plan.query;
  const hasParams = query.parameters.length > 0;
  const hasRedirects = plan.hasRedirects;
  const hasFailures = plan.needsFailureProjection;
  if (!hasParams && !hasRedirects && !hasFailures) {
    return null;
  }

  const fields: string[] = [];
  if (hasParams) {
    fields.push(`    params: ${paramsTypeName(query.name)};`);
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
