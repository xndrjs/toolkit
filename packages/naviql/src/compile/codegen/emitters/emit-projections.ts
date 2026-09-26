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
import type {
  Expansion,
  Program,
  ProjectionArm,
  QueryDefinition,
  ResourceDefinition,
  ResourceProjection,
  TypeExpr,
} from "../../../ir";
import { emitConstruction } from "./emit-construction";
import { emitExpr, projectionArmDiscriminant, projectionExprScope } from "./emit-expr";
import {
  ariFactoryName,
  executionContextTypeName,
  paramsTypeName,
  projectFnName,
  queryResultTypeName,
} from "../naming";

type ResourceIndex = Map<string, ResourceDefinition>;

/** resource → unique resolve-arm target resource names. */
type ResolveTargetIndex = Map<string, string[]>;

function resourceIndex(program: Program): ResourceIndex {
  return new Map(program.resources.map((r) => [r.name, r]));
}

function resolveTargetIndex(query: QueryDefinition): ResolveTargetIndex {
  const out: ResolveTargetIndex = new Map();
  for (const projection of query.projections) {
    if (projection.resolveArms === null) continue;
    out.set(projection.resource, [
      ...new Set(projection.resolveArms.map((arm) => arm.target.resource)),
    ]);
  }
  return out;
}

/** Projections that emit a `projectOn*` shell (excludes resolve-only). */
function projectableProjections(query: QueryDefinition): ResourceProjection[] {
  return query.projections.filter((p) => p.resolveArms === null);
}

function resourceRefsFromPayload(payload: TypeExpr): string[] | null {
  if (payload.kind === "resourceRef") {
    return [payload.name];
  }
  if (payload.kind === "union") {
    const names: string[] = [];
    for (const member of payload.members) {
      if (member.kind !== "resourceRef") {
        return null;
      }
      names.push(member.name);
    }
    return names;
  }
  return null;
}

/** Collection resource (`TabCollection: Tab[]`) → element resource name. */
function collectionElement(payload: TypeExpr): string | null {
  if (payload.kind === "array" && payload.of.kind === "resourceRef") {
    return payload.of.name;
  }
  return null;
}

/**
 * Union / resource-valued / resolve-only payload
 * (`Entry: Hero | Tabs`, `CustomReference resolve to Entry | Asset`)
 * → concrete member names to discriminate in `projectNode`.
 */
function stripToConcreteMembers(
  targetName: string,
  resources: ResourceIndex,
  resolveTargets: ResolveTargetIndex,
  seen = new Set<string>()
): string[] | null {
  if (seen.has(targetName)) {
    return null;
  }
  seen.add(targetName);

  const resolveRefs = resolveTargets.get(targetName);
  if (resolveRefs !== undefined && resolveRefs.length > 0) {
    const members: string[] = [];
    for (const ref of resolveRefs) {
      const nested = stripToConcreteMembers(ref, resources, resolveTargets, new Set(seen));
      if (nested === null) {
        members.push(ref);
      } else {
        members.push(...nested);
      }
    }
    return [...new Set(members)];
  }

  const target = resources.get(targetName);
  if (!target) {
    return null;
  }

  const payload = target.payloadType;
  if (payload.kind === "object" || payload.kind === "array") {
    return null;
  }

  const refs = resourceRefsFromPayload(payload);
  if (refs === null || refs.length === 0) {
    return null;
  }

  const members: string[] = [];
  for (const ref of refs) {
    const nested = stripToConcreteMembers(ref, resources, resolveTargets, new Set(seen));
    if (nested === null) {
      members.push(ref);
    } else {
      members.push(...nested);
    }
  }
  return [...new Set(members)];
}

function projectOnFnName(resourceName: string): string {
  return `projectOn${resourceName}`;
}

/** All expansions under a projection (flat body or flattened when-arms). */
function allProjectionExpansions(projection: ResourceProjection): Expansion[] {
  if (projection.resolveArms !== null) {
    return [];
  }
  if (projection.arms !== null) {
    return projection.arms.flatMap((arm) => arm.expansions);
  }
  return projection.expansions;
}

/**
 * Project a `many` each-comprehension: same ARI list as strategy emit, then map
 * each ARI through `projectNode`.
 */
function emitManyProject(expansion: Expansion): string {
  const comprehension = expansion.comprehension;
  if (comprehension === null) {
    throw new Error("emitProjections: many expansion missing comprehension");
  }

  const { itemBinding, source, arms } = comprehension;
  const sourceExpr = emitExpr(source, projectionExprScope);

  if (arms.length === 1) {
    const arm = arms[0]!;
    const construction = emitConstruction(arm.target, projectionExprScope);
    const mapFn = `(${itemBinding}: any) => projectNode(${construction})`;
    if (arm.when !== null) {
      return `${sourceExpr}.filter((${itemBinding}: any) => ${emitExpr(arm.when, projectionExprScope)}).map(${mapFn})`;
    }
    return `${sourceExpr}.map(${mapFn})`;
  }

  // Multi-arm: flatMap preserves source order (same as strategy emit).
  const branches = arms.map((arm) => {
    const construction = emitConstruction(arm.target, projectionExprScope);
    if (arm.when !== null) {
      return `if (${emitExpr(arm.when, projectionExprScope)}) return [projectNode(${construction})];`;
    }
    return `return [projectNode(${construction})];`;
  });
  const body = [...branches, `return [];`].join("\n        ");
  return `${sourceExpr}.flatMap((${itemBinding}: any): any[] => {\n        ${body}\n      })`;
}

/**
 * Expression that yields the projected value for one expansion alias.
 * - ordinary / union target → `projectNode(ari)` (union discriminated inside)
 * - collection target → lookup collection payload, map member ARIs through `projectNode`
 * - `many` → each-comprehension map of the above
 */
function emitExpansionValue(
  expansion: Expansion,
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>
): string {
  if (expansion.multiplicity === "many" && expansion.comprehension !== null) {
    return emitManyProject(expansion);
  }

  if (expansion.target === null) {
    throw new Error(`emitProjections: one-expand missing target in query '${queryName}'`);
  }

  const targetName = expansion.target.resource;
  const target = resources.get(targetName);
  if (!target) {
    throw new Error(
      `emitProjections: unknown expansion target '${targetName}' in query '${queryName}'`
    );
  }

  const element = collectionElement(target.payloadType);
  if (element !== null) {
    const construction = emitConstruction(expansion.target, projectionExprScope);
    const elementResource = resources.get(element);
    if (!elementResource) {
      throw new Error(
        `emitProjections: collection '${targetName}' element '${element}' is unknown in query '${queryName}'`
      );
    }
    const elementAri = ariFactoryName(element);
    const argParts = elementResource.identity.fields.map((field) => {
      if (contextFieldNames.has(field.name)) {
        return `${field.name}: args.executionContext.${field.name}`;
      }
      return `${field.name}: item.${field.name}`;
    });
    // Same member ARI construction as strategy fan-out so nested `@id` expansions work.
    return [
      `(() => {`,
      `  const __collectionAri = ${construction};`,
      `  const __collectionPayload = contentMap.get(__collectionAri as never) as any;`,
      `  if (__collectionPayload === undefined) return undefined;`,
      `  return __collectionPayload.map((item: any) => projectNode(${elementAri}({ ${argParts.join(", ")} })));`,
      `})()`,
    ].join("\n");
  }

  return `projectNode(${emitConstruction(expansion.target, projectionExprScope)})`;
}

function emitShellBody(
  resourceName: string,
  selectedFields: string[],
  expansions: Expansion[],
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>,
  indent: string
): string {
  const lines: string[] = [];

  lines.push(`${indent}const shell: any = { $type: ${JSON.stringify(resourceName)} };`);
  lines.push(`${indent}memo.set(resource.toString(), shell);`);

  for (const fieldName of selectedFields) {
    lines.push(`${indent}shell.${fieldName} = payload.${fieldName};`);
  }

  for (const expansion of expansions) {
    const value = emitExpansionValue(expansion, resources, queryName, contextFieldNames);
    const indented = value.includes("\n")
      ? value
          .split("\n")
          .map((line, i) => (i === 0 ? line : `${indent}${line}`))
          .join("\n")
      : value;
    lines.push(`${indent}shell.${expansion.alias} = ${indented};`);
  }

  lines.push(`${indent}return shell;`);
  return lines.join("\n");
}

function emitProjectOnBody(
  projection: ResourceProjection,
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>
): string {
  return emitShellBody(
    projection.resource,
    projection.selectedFields,
    projection.expansions,
    resources,
    queryName,
    contextFieldNames,
    "    "
  );
}

function emitArmedArmCase(
  projection: ResourceProjection,
  arm: ProjectionArm,
  armIndex: number,
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>
): { labels: string[]; body: string } {
  const disc = projectionArmDiscriminant(arm.when, projection.binding);
  const labels = disc !== null ? [disc] : [];
  const body = [
    `        {`,
    emitShellBody(
      projection.resource,
      arm.selectedFields,
      arm.expansions,
      resources,
      queryName,
      contextFieldNames,
      "          "
    ),
    `        }`,
  ].join("\n");

  if (labels.length === 0) {
    // Non-discriminant `when` — fall back to if-guard (caller handles).
    return { labels: [`__arm${armIndex}`], body };
  }
  return { labels, body };
}

function emitArmedProjectOnBody(
  projection: ResourceProjection,
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>
): string {
  const arms = projection.arms;
  if (arms === null) {
    throw new Error("emitProjections: emitArmedProjectOnBody called without arms");
  }

  // Prefer switch on payload.type when every arm is `binding.type == "Lit"`.
  const allDisc = arms.every(
    (arm) => projectionArmDiscriminant(arm.when, projection.binding) !== null
  );

  if (allDisc) {
    const cases: string[] = [];
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i]!;
      const { labels, body } = emitArmedArmCase(
        projection,
        arm,
        i,
        resources,
        queryName,
        contextFieldNames
      );
      cases.push([`      case ${JSON.stringify(labels[0]!)}:`, body].join("\n"));
    }
    cases.push(
      [
        `      default:`,
        `        throw new Error(`,
        `          ${JSON.stringify(`projectOn${projection.resource}: cannot discriminate ${projection.resource} payload (type=`)} +`,
        `            JSON.stringify((payload as any).type) +`,
        `            ")"`,
        `        );`,
      ].join("\n")
    );
    return [`    switch ((payload as any).type) {`, cases.join("\n"), `    }`].join("\n");
  }

  // Mixed / non-discriminant filters → if/else chain.
  const branches: string[] = [];
  for (let i = 0; i < arms.length; i++) {
    const arm = arms[i]!;
    const cond = emitExpr(arm.when, projectionExprScope);
    const keyword = i === 0 ? "if" : "} else if";
    branches.push(
      [
        `    ${keyword} (${cond}) {`,
        emitShellBody(
          projection.resource,
          arm.selectedFields,
          arm.expansions,
          resources,
          queryName,
          contextFieldNames,
          "      "
        ),
      ].join("\n")
    );
  }
  branches.push(
    [
      `    } else {`,
      `      throw new Error(`,
      `        ${JSON.stringify(`projectOn${projection.resource}: no when-arm matched for ${projection.resource}`)}`,
      `      );`,
      `    }`,
    ].join("\n")
  );
  return branches.join("\n");
}

function emitProjectOnHelper(
  projection: ResourceProjection,
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>
): string {
  const name = projectOnFnName(projection.resource);
  const body =
    projection.arms !== null
      ? emitArmedProjectOnBody(projection, resources, queryName, contextFieldNames)
      : emitProjectOnBody(projection, resources, queryName, contextFieldNames);
  return [`  const ${name} = (resource: any, payload: any): any => {`, body, `  };`].join("\n");
}

/**
 * Resources that appear as collection-edge elements in this query (must have `on`).
 */
function collectionElementResources(query: QueryDefinition, resources: ResourceIndex): Set<string> {
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
 * Armed projections contribute their when-arm discriminants; flat resources
 * use the resource name (matches rematerialize `payload.type === "Hero"`).
 */
function discriminationLabelsForMember(
  member: string,
  projected: Map<string, ResourceProjection>
): string[] {
  const projection = projected.get(member);
  if (projection?.arms !== null && projection?.arms !== undefined) {
    const labels: string[] = [];
    for (const arm of projection.arms) {
      const disc = projectionArmDiscriminant(arm.when, projection.binding);
      if (disc !== null) {
        labels.push(disc);
      }
    }
    if (labels.length > 0) {
      return labels;
    }
  }
  return [member];
}

/**
 * Union / resource-valued / resolve-only resources that need `projectNode`
 * discrimination arms (no projectable `on`). Skips projectable targets.
 * Always includes resolve-only projections (settled payload under locator key).
 */
function unionTargetResources(
  query: QueryDefinition,
  resources: ResourceIndex,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex
): Map<string, string[]> {
  const out = new Map<string, string[]>();

  const consider = (targetName: string) => {
    if (projected.has(targetName) || out.has(targetName)) {
      return;
    }
    const members = stripToConcreteMembers(targetName, resources, resolveTargets);
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

  // Resolve-only root / unused resolve clauses still need strip arms when present.
  for (const resourceName of resolveTargets.keys()) {
    consider(resourceName);
  }

  return out;
}

function emitProjectNode(query: QueryDefinition, resources: ResourceIndex, fnName: string): string {
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

  for (const [unionName, members] of unions) {
    const discCases: string[] = [];
    for (const member of members) {
      if (!projected.has(member)) {
        throw new Error(
          `emitProjections: query '${query.name}' expands union '${unionName}' member '${member}' but has no 'on ${member}' projection`
        );
      }
      const labels = discriminationLabelsForMember(member, projected);
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

function emitArgsType(query: QueryDefinition): string | null {
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;
  if (!hasParams && !hasContext) {
    return null;
  }

  const fields: string[] = [];
  if (hasParams) {
    fields.push(`    params: ${paramsTypeName(query.name)};`);
  }
  if (hasContext) {
    fields.push(`    executionContext: ${executionContextTypeName(query.name)};`);
  }
  return `{\n${fields.join("\n")}\n  }`;
}

function emitQueryProjection(
  query: QueryDefinition,
  resources: ResourceIndex,
  registryTypeName: string
): string {
  const fnName = projectFnName(query.name);
  const resultType = queryResultTypeName(query.name);
  const rootAri = ariFactoryName(query.roots[0]!.construction.resource);
  const argsType = emitArgsType(query);

  const sigParams = [
    `root: ReturnType<typeof ${rootAri}>`,
    `contentMap: ContentMap<${registryTypeName}>`,
  ];
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

  const body = [
    `  const memo = new Map<string, object>();`,
    "",
    helpers.join("\n\n"),
    "",
    projectNode,
    "",
    `  return projectNode(root) as ${resultType};`,
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
