/**
 * Emit memoized `project*` materializers from checked queries.
 *
 * Restores expansion aliases over a resolved `ContentMap`, stamps `$type`
 * discriminators, and memos by `ari.toString()` with shell-before-edges
 * (cycle-safe). Union / collection expansion targets are stripped to member
 * projections (no `on EditorialModule` / `on TabCollection` required).
 */
import type {
  Expansion,
  Program,
  QueryDefinition,
  ResourceDefinition,
  ResourceProjection,
  TypeExpr,
} from "../../../ir";
import { emitConstruction } from "./emit-construction";
import { emitExpr } from "./emit-expr";
import {
  ariFactoryName,
  executionContextTypeName,
  paramsTypeName,
  projectFnName,
  queryResultTypeName,
} from "../naming";

type ResourceIndex = Map<string, ResourceDefinition>;

function resourceIndex(program: Program): ResourceIndex {
  return new Map(program.resources.map((r) => [r.name, r]));
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
 * Union / resource-valued payload (`Entry: Hero | Tabs`, `CustomReference: Entry`)
 * → concrete member names to discriminate in `projectNode`.
 */
function stripToConcreteMembers(
  targetName: string,
  resources: ResourceIndex,
  seen = new Set<string>()
): string[] | null {
  if (seen.has(targetName)) {
    return null;
  }
  seen.add(targetName);

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
    const nested = stripToConcreteMembers(ref, resources, new Set(seen));
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
  const sourceExpr = emitExpr(source);

  if (arms.length === 1) {
    const arm = arms[0]!;
    const construction = emitConstruction(arm.target);
    const mapFn = `(${itemBinding}: any) => projectNode(${construction})`;
    if (arm.when !== null) {
      return `${sourceExpr}.filter((${itemBinding}: any) => ${emitExpr(arm.when)}).map(${mapFn})`;
    }
    return `${sourceExpr}.map(${mapFn})`;
  }

  // Multi-arm: flatMap preserves source order (same as strategy emit).
  const branches = arms.map((arm) => {
    const construction = emitConstruction(arm.target);
    if (arm.when !== null) {
      return `if (${emitExpr(arm.when)}) return [projectNode(${construction})];`;
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
    const construction = emitConstruction(expansion.target);
    const elementResource = resources.get(element);
    if (!elementResource) {
      throw new Error(
        `emitProjections: collection '${targetName}' element '${element}' is unknown in query '${queryName}'`
      );
    }
    const elementAri = ariFactoryName(element);
    const argParts = elementResource.identity.fields.map((field) => {
      if (contextFieldNames.has(field.name)) {
        return `${field.name}: executionContext.${field.name}`;
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

  return `projectNode(${emitConstruction(expansion.target)})`;
}

function emitProjectOnBody(
  projection: ResourceProjection,
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>
): string {
  const lines: string[] = [];

  lines.push(`    const shell: any = { $type: ${JSON.stringify(projection.resource)} };`);
  lines.push(`    memo.set(resource.toString(), shell);`);

  for (const fieldName of projection.selectedFields) {
    lines.push(`    shell.${fieldName} = payload.${fieldName};`);
  }

  for (const expansion of projection.expansions) {
    const value = emitExpansionValue(expansion, resources, queryName, contextFieldNames);
    // Indent multi-line IIFEs one level under shell assign.
    const indented = value.includes("\n")
      ? value
          .split("\n")
          .map((line, i) => (i === 0 ? line : `    ${line}`))
          .join("\n")
      : value;
    lines.push(`    shell.${expansion.alias} = ${indented};`);
  }

  lines.push(`    return shell;`);
  return lines.join("\n");
}

function emitProjectOnHelper(
  projection: ResourceProjection,
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>
): string {
  const name = projectOnFnName(projection.resource);
  const body = emitProjectOnBody(projection, resources, queryName, contextFieldNames);
  return [`  const ${name} = (resource: any, payload: any): any => {`, body, `  };`].join("\n");
}

/**
 * Resources that appear as collection-edge elements in this query (must have `on`).
 */
function collectionElementResources(query: QueryDefinition, resources: ResourceIndex): Set<string> {
  const out = new Set<string>();
  for (const projection of query.projections) {
    for (const expansion of projection.expansions) {
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
 * Union / resource-valued resources that appear as expansion targets (need
 * `projectNode` discrimination arms even without an `on Entry` projection).
 */
function unionTargetResources(
  query: QueryDefinition,
  resources: ResourceIndex
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const projection of query.projections) {
    for (const expansion of projection.expansions) {
      const targets =
        expansion.multiplicity === "many" && expansion.comprehension !== null
          ? expansion.comprehension.arms.map((a) => a.target.resource)
          : expansion.target !== null
            ? [expansion.target.resource]
            : [];
      for (const targetName of targets) {
        const members = stripToConcreteMembers(targetName, resources);
        if (members !== null && members.length > 0) {
          out.set(targetName, members);
        }
      }
    }
  }
  return out;
}

function emitProjectNode(query: QueryDefinition, resources: ResourceIndex, fnName: string): string {
  const projected = new Map(query.projections.map((p) => [p.resource, p]));
  const unions = unionTargetResources(query, resources);

  const cases: string[] = [];

  for (const projection of query.projections) {
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
      discCases.push(
        [
          `          case ${JSON.stringify(member)}:`,
          `            return ${projectOnFnName(member)}(ari, payload);`,
        ].join("\n")
      );
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
  const rootAri = ariFactoryName(query.root.resource);
  const argsType = emitArgsType(query);
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;

  const sigParams = [
    `root: ReturnType<typeof ${rootAri}>`,
    `contentMap: ContentMap<${registryTypeName}>`,
  ];
  if (argsType !== null) {
    sigParams.push(`args: ${argsType}`);
  }

  const bodyPreamble: string[] = [];
  if (hasParams && hasContext) {
    bodyPreamble.push(`  const { params, executionContext } = args;`);
  } else if (hasParams) {
    bodyPreamble.push(`  const { params } = args;`);
  } else if (hasContext) {
    bodyPreamble.push(`  const { executionContext } = args;`);
  }
  bodyPreamble.push(`  const memo = new Map<string, object>();`);

  const embedded = collectionElementResources(query, resources);
  const contextFieldNames = new Set(query.context.map((f) => f.name));
  const helpers: string[] = [];

  for (const projection of query.projections) {
    helpers.push(emitProjectOnHelper(projection, resources, query.name, contextFieldNames));
  }

  // Collection elements must have an `on` projection (projected via ContentMap).
  for (const element of embedded) {
    if (!query.projections.some((p) => p.resource === element)) {
      throw new Error(
        `emitProjections: query '${query.name}' expands collection element '${element}' but has no 'on ${element}' projection`
      );
    }
  }

  const projectNode = emitProjectNode(query, resources, fnName);

  const body = [
    ...bodyPreamble,
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
