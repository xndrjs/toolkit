import type {
  Expansion,
  OnFailurePolicy,
  ProjectionArm,
  ProjectionArmBody,
  ResourceProjection,
  TypeExpr,
} from "../../../ir";
import {
  isObjectLikePayload,
  narrowPayloadByFilter,
  residualPayloadAfterFilters,
} from "../../../check/discriminants";
import { resolveSelectedFields } from "../../../check/projection-include";
import { emitConstruction, emitExpr, projectionExprScope } from "../shared";
import { ariFactoryName, payloadTypeName, projectionTypeName } from "../naming";
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

function defaultArmPayloadType(
  projection: ResourceProjection,
  resources: ResourceIndex
): { payloadType: TypeExpr; unreachable: boolean } {
  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjections: unknown resource '${projection.resource}' while emitting default shell`
    );
  }
  const residual = residualPayloadAfterFilters(
    resource.payloadType,
    projection.arms?.map((arm) => arm.when) ?? [],
    projection.binding,
    resources
  );
  return {
    payloadType: residual ?? resource.payloadType,
    unreachable: residual === null,
  };
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
    const mapFn = `(${itemBinding}) => ${emitProjectEdgeCall(construction, arm.onFailure)}`;
    if (arm.when !== null) {
      return `${sourceExpr}.filter((${itemBinding}) => ${emitExpr(arm.when, projectionExprScope)}).map(${mapFn})`;
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
  return `${sourceExpr}.flatMap((${itemBinding}) => {\n        ${body}\n      })`;
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

  // Array / scalar / primitive: empty `on R` returns the payload as-is.
  if (!isObjectLikePayload(resource.payloadType, resources)) {
    const hasBody =
      projection.selectedFields.length > 0 ||
      projection.expansions.length > 0 ||
      projection.include === "all" ||
      projection.include === "properties";
    if (hasBody) {
      throw new Error(
        `emitProjections: cannot project fields/expands on non-object payload of '${projection.resource}' in query '${queryName}'`
      );
    }
    return [`    memo.set(resource.toString(), payload);`, `    return payload;`].join("\n");
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

  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjections: unknown resource '${projection.resource}' while emitting armed shell`
    );
  }
  if (!isObjectLikePayload(resource.payloadType, resources)) {
    throw new Error(
      `emitProjections: cannot arm when-clauses on non-object payload of '${projection.resource}' in query '${queryName}'`
    );
  }

  const defaultPayload = defaultArmPayloadType(projection, resources);
  const defaultShell = emitArmShell(
    projection,
    defaultArm,
    defaultPayload.payloadType,
    resources,
    queryName,
    "      ",
    resourceTag
  );
  const defaultBody = defaultPayload.unreachable
    ? [
        `      const defaultPayload = payload as ${payloadTypeName(projection.resource)};`,
        defaultShell.replaceAll("payload.", "defaultPayload."),
      ].join("\n")
    : defaultShell;

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
  branches.push([`    } else {`, defaultBody, `    }`].join("\n"));
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
  const resourceType = `ReturnType<typeof ${ariFactoryName(projection.resource)}>`;
  const payloadType = payloadTypeName(projection.resource);
  const resultType = projectionTypeName(queryName, projection.resource);
  return [
    `  const ${name} = (resource: ${resourceType}, payload: ${payloadType}): ${resultType} => {`,
    body,
    `  };`,
  ].join("\n");
}
