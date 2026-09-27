import type { Expansion, ProjectionArm, ResourceProjection, TypeExpr } from "../../../ir";
import { narrowPayloadByFilter } from "../../../check/discriminants";
import { resolveSelectedFields } from "../../../check/projection-include";
import {
  emitConstruction,
  emitExpr,
  projectionArmDiscriminant,
  projectionExprScope,
} from "../shared";
import { ariFactoryName } from "../naming";
import { collectionElement } from "../../../check/projection-graph";
import { type ResourceIndex } from "./shared";

export function projectOnFnName(resourceName: string): string {
  return `projectOn${resourceName}`;
}

/** Payload type for include resolution on a when-arm (narrowed when possible). */
function armPayloadType(
  projection: ResourceProjection,
  arm: ProjectionArm,
  resources: ResourceIndex
): TypeExpr {
  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjections: unknown resource '${projection.resource}' while emitting armed shell`
    );
  }
  return (
    narrowPayloadByFilter(resource.payloadType, arm.when, projection.binding, resources) ??
    resource.payloadType
  );
}

/**
 * Project a `many` each-comprehension: same ARI list as strategy emit, then map
 * each ARI through `projectNode`.
 */
export function emitManyProject(expansion: Expansion): string {
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
export function emitExpansionValue(
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

export function emitShellBody(
  resourceName: string,
  selectedFields: string[],
  expansions: Expansion[],
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>,
  indent: string,
  include: ResourceProjection["include"] = null,
  payloadType?: TypeExpr
): string {
  const lines: string[] = [];
  const resolvedPayload =
    payloadType ??
    (() => {
      const resource = resources.get(resourceName);
      if (!resource) {
        throw new Error(`emitProjections: unknown resource '${resourceName}' while emitting shell`);
      }
      return resource.payloadType;
    })();
  const effectiveFields = resolveSelectedFields(
    selectedFields,
    expansions,
    include,
    resolvedPayload,
    resources
  );

  lines.push(`${indent}const shell: any = { $type: ${JSON.stringify(resourceName)} };`);
  lines.push(`${indent}memo.set(resource.toString(), shell);`);

  for (const fieldName of effectiveFields) {
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

export function emitProjectOnBody(
  projection: ResourceProjection,
  resources: ResourceIndex,
  queryName: string,
  contextFieldNames: ReadonlySet<string>
): string {
  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjections: unknown resource '${projection.resource}' while emitting flat shell`
    );
  }
  return emitShellBody(
    projection.resource,
    projection.selectedFields,
    projection.expansions,
    resources,
    queryName,
    contextFieldNames,
    "    ",
    projection.include,
    resource.payloadType
  );
}

export function emitArmedArmCase(
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
      "          ",
      arm.include ?? projection.include,
      armPayloadType(projection, arm, resources)
    ),
    `        }`,
  ].join("\n");

  if (labels.length === 0) {
    // Non-discriminant `when` — fall back to if-guard (caller handles).
    return { labels: [`__arm${armIndex}`], body };
  }
  return { labels, body };
}

export function emitArmedProjectOnBody(
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
          "      ",
          arm.include ?? projection.include,
          armPayloadType(projection, arm, resources)
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

export function emitProjectOnHelper(
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
