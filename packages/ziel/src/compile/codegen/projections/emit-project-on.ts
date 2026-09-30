import type {
  Expansion,
  OnFailurePolicy,
  ProjectionArm,
  ProjectionArmBody,
  ResourceProjection,
  TypeExpr,
} from "../../../ir";
import { narrowPayloadByFilter } from "../../../check/discriminants";
import { resolveSelectedFields } from "../../../check/projection-include";
import { emitConstruction, emitExpr, projectionExprScope } from "../shared";
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

function defaultArmPayloadType(projection: ResourceProjection, resources: ResourceIndex): TypeExpr {
  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjections: unknown resource '${projection.resource}' while emitting default shell`
    );
  }
  return resource.payloadType;
}

function emitProjectEdgeCall(ariExpr: string, onFailure: OnFailurePolicy): string {
  if (onFailure === "throw") {
    return `projectNode(${ariExpr})`;
  }
  return `projectEdge(${ariExpr}, ${JSON.stringify(onFailure)})`;
}

/**
 * Project a `many` each-comprehension: same ARI list as strategy emit, then map
 * each ARI through `projectNode` / `projectEdge` per arm policy.
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
    const mapFn = `(${itemBinding}: any) => ${emitProjectEdgeCall(construction, arm.onFailure)}`;
    if (arm.when !== null) {
      return `${sourceExpr}.filter((${itemBinding}: any) => ${emitExpr(arm.when, projectionExprScope)}).map(${mapFn})`;
    }
    return `${sourceExpr}.map(${mapFn})`;
  }

  // Multi-arm: flatMap preserves source order (same as strategy emit).
  const branches = arms.map((arm) => {
    const construction = emitConstruction(arm.target, projectionExprScope);
    const projected = emitProjectEdgeCall(construction, arm.onFailure);
    if (arm.when !== null) {
      return `if (${emitExpr(arm.when, projectionExprScope)}) return [${projected}];`;
    }
    return `return [${projected}];`;
  });
  const body = [...branches, `return [];`].join("\n        ");
  return `${sourceExpr}.flatMap((${itemBinding}: any): any[] => {\n        ${body}\n      })`;
}

/**
 * Expression that yields the projected value for one expansion alias.
 * - ordinary target → `projectNode(ari)` (requires projectable `on` for that resource)
 * - `many` → each-comprehension map of the above
 * - `on failure set null` / `set error` → `projectEdge` when payload/failure is absent
 */
export function emitExpansionValue(
  expansion: Expansion,
  resources: ResourceIndex,
  queryName: string
): string {
  if (expansion.multiplicity === "many" && expansion.comprehension !== null) {
    return emitManyProject(expansion);
  }

  if (expansion.target === null) {
    throw new Error(`emitProjections: one-expand missing target in query '${queryName}'`);
  }

  const targetName = expansion.target.resource;
  if (!resources.get(targetName)) {
    throw new Error(
      `emitProjections: unknown expansion target '${targetName}' in query '${queryName}'`
    );
  }

  return emitProjectEdgeCall(
    emitConstruction(expansion.target, projectionExprScope),
    expansion.onFailure
  );
}

export function emitShellBody(
  resourceName: string,
  selectedFields: string[],
  expansions: Expansion[],
  resources: ResourceIndex,
  queryName: string,
  indent: string,
  include: ResourceProjection["include"] = null,
  payloadType?: TypeExpr,
  excludedFields: readonly string[] = [],
  resourceTag?: string
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
    resources,
    excludedFields
  );

  const shellInit =
    resourceTag === undefined ? "{}" : `{ ${resourceTag}: ${JSON.stringify(resourceName)} }`;
  lines.push(`${indent}const shell: any = ${shellInit};`);
  lines.push(`${indent}memo.set(resource.toString(), shell);`);

  for (const fieldName of effectiveFields) {
    lines.push(`${indent}shell.${fieldName} = payload.${fieldName};`);
  }

  for (const expansion of expansions) {
    const value = emitExpansionValue(expansion, resources, queryName);
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
  resourceTag?: string
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
    "    ",
    projection.include,
    resource.payloadType,
    projection.excludedFields,
    resourceTag
  );
}

function emitArmShell(
  projection: ResourceProjection,
  arm: ProjectionArmBody,
  payloadType: TypeExpr,
  resources: ResourceIndex,
  queryName: string,
  indent: string,
  resourceTag?: string
): string {
  return emitShellBody(
    projection.resource,
    arm.selectedFields,
    arm.expansions,
    resources,
    queryName,
    indent,
    arm.include ?? projection.include,
    payloadType,
    arm.excludedFields,
    resourceTag
  );
}

/**
 * Ordered `if` / `else if` on when-arms, ending in the required `default` body.
 */
export function emitArmedProjectOnBody(
  projection: ResourceProjection,
  resources: ResourceIndex,
  queryName: string,
  resourceTag?: string
): string {
  const arms = projection.arms;
  if (arms === null) {
    throw new Error("emitProjections: emitArmedProjectOnBody called without arms");
  }
  const defaultArm = projection.defaultArm;
  if (defaultArm === null) {
    throw new Error(
      `emitProjections: armed 'on ${projection.resource}' is missing defaultArm (checker should reject)`
    );
  }

  const branches: string[] = [];
  for (let i = 0; i < arms.length; i++) {
    const arm = arms[i]!;
    const cond = emitExpr(arm.when, projectionExprScope);
    const keyword = i === 0 ? "if" : "} else if";
    branches.push(
      [
        `    ${keyword} (${cond}) {`,
        emitArmShell(
          projection,
          arm,
          armPayloadType(projection, arm, resources),
          resources,
          queryName,
          "      ",
          resourceTag
        ),
      ].join("\n")
    );
  }
  branches.push(
    [
      `    } else {`,
      emitArmShell(
        projection,
        defaultArm,
        defaultArmPayloadType(projection, resources),
        resources,
        queryName,
        "      ",
        resourceTag
      ),
      `    }`,
    ].join("\n")
  );
  return branches.join("\n");
}

export function emitProjectOnHelper(
  projection: ResourceProjection,
  resources: ResourceIndex,
  queryName: string,
  resourceTag?: string
): string {
  const name = projectOnFnName(projection.resource);
  const body =
    projection.arms !== null
      ? emitArmedProjectOnBody(projection, resources, queryName, resourceTag)
      : emitProjectOnBody(projection, resources, queryName, resourceTag);
  return [`  const ${name} = (resource: any, payload: any): any => {`, body, `  };`].join("\n");
}
