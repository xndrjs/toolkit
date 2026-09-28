import type { QueryDefinition, ResourceProjection } from "../../../ir";
import { closedPayloadDiscriminants } from "../../../check/discriminants";
import {
  allProjectionExpansions,
  collectionElement,
  projectableProjections,
  resolveTargetIndex,
  stripToConcreteMembers,
  type ResolveTargetIndex,
} from "../../../check/projection-graph";
import { ariFactoryName, executionContextTypeName, paramsTypeName } from "../naming";
import { projectOnFnName } from "./emit-project-on";
import { type ResourceIndex } from "./shared";

/**
 * Resources that appear as collection-edge elements in this query (must have `on`).
 */
export function collectionElementResources(
  query: QueryDefinition,
  resources: ResourceIndex
): Set<string> {
  const out = new Set<string>();
  for (const projection of query.projections) {
    for (const expansion of allProjectionExpansions(projection)) {
      if (expansion.target === null) continue;
      const target = resources.get(expansion.target.resource);
      if (!target) continue;
      const element = collectionElement(target.payloadType);
      if (element !== null) {
        out.add(element);
      }
    }
  }
  return out;
}

/**
 * Payload `type` case labels that should route to `projectOn${member}`.
 * Armed projections with a default arm route every closed payload discriminant
 * (and fall through) to `projectOn*` so ordered when/default runs there.
 * Flat resources use the resource name.
 */
export function discriminationLabelsForMember(
  member: string,
  projected: Map<string, ResourceProjection>,
  resources: ResourceIndex
): string[] {
  const projection = projected.get(member);
  if (projection?.arms !== null && projection?.arms !== undefined) {
    const resource = resources.get(member);
    if (resource && projection.defaultArm !== null) {
      const closed = closedPayloadDiscriminants(resource.payloadType, resources);
      if (closed !== null && closed.size > 0) {
        return [...closed].sort();
      }
    }
  }
  return [member];
}

/**
 * Union / resource-valued resources that need `projectNode` discrimination arms
 * (no projectable `on`). Resolve-only locators are handled separately by following
 * {@link ResolveResourceGraphOutput.redirects}.
 */
export function unionTargetResources(
  query: QueryDefinition,
  resources: ResourceIndex,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex
): Map<string, string[]> {
  const out = new Map<string, string[]>();

  const consider = (targetName: string) => {
    if (projected.has(targetName) || out.has(targetName) || resolveTargets.has(targetName)) {
      return;
    }
    const members = stripToConcreteMembers(targetName, resources, projected, resolveTargets);
    if (members !== null && members.length > 0) {
      out.set(targetName, members);
    }
  };

  for (const projection of query.projections) {
    for (const expansion of allProjectionExpansions(projection)) {
      const targets =
        expansion.multiplicity === "many" && expansion.comprehension !== null
          ? expansion.comprehension.arms.map((a) => a.target.resource)
          : expansion.target !== null
            ? [expansion.target.resource]
            : [];
      for (const targetName of targets) {
        consider(targetName);
      }
    }
  }

  return out;
}

export function emitProjectNode(
  query: QueryDefinition,
  resources: ResourceIndex,
  fnName: string
): string {
  const projectable = projectableProjections(query);
  const projected = new Map(projectable.map((p) => [p.resource, p]));
  const projectedNames = new Set(projected.keys());
  const resolveTargets = resolveTargetIndex(query);
  const unions = unionTargetResources(query, resources, projectedNames, resolveTargets);

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

  for (const locator of resolveTargets.keys()) {
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

  for (const [unionName, members] of unions) {
    const discCases: string[] = [];
    for (const member of members) {
      if (!projected.has(member)) {
        throw new Error(
          `emitProjections: query '${query.name}' expands union '${unionName}' member '${member}' but has no 'on ${member}' projection`
        );
      }
      const labels = discriminationLabelsForMember(member, projected, resources);
      for (const label of labels) {
        discCases.push(
          [
            `          case ${JSON.stringify(label)}:`,
            `            return ${projectOnFnName(member)}(ari, payload);`,
          ].join("\n")
        );
      }
    }
    discCases.push(
      [
        `          default:`,
        `            throw new Error(`,
        `              ${JSON.stringify(`${fnName}: cannot discriminate ${unionName} payload (type=`)} +`,
        `                JSON.stringify((payload as any).type) +`,
        `                ")"`,
        `            );`,
      ].join("\n")
    );

    cases.push(
      [
        `      case ${JSON.stringify(unionName)}: {`,
        `        switch ((payload as any).type) {`,
        discCases.join("\n"),
        `        }`,
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
  const hasRedirects = resolveTargetIndex(query).size > 0;
  if (!hasParams && !hasContext && !hasRedirects) {
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
