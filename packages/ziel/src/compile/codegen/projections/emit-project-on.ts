import type { Expansion, OnFailurePolicy } from "../../../ir";
import type { PlannedProjectionBody, ProjectionPlan } from "../../../analyze";
import { isObjectLikePayload } from "../../../check/discriminants";
import { emitConstruction, emitExpr, projectionExprScope } from "../shared";
import { projectionArmDiscriminant } from "../shared";
import {
  ariFactoryName,
  payloadTypeName,
  projectionTypeName,
  projectionVariantTypeName,
} from "../naming";
import { printTypeExpr } from "../resources";
import { type ResourceIndex } from "./shared";

export function projectOnFnName(resourceName: string): string {
  return `projectOn${resourceName}`;
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
  body: PlannedProjectionBody,
  shellType: string,
  resources: ResourceIndex,
  queryName: string,
  indent: string,
  narrowPayload: boolean,
  resourceTag?: string
): string {
  const lines: string[] = [];
  const shellInit =
    resourceTag === undefined ? "{}" : `{ ${resourceTag}: ${JSON.stringify(resourceName)} }`;
  lines.push(
    `${indent}const shell: Partial<${shellType}> = ${shellInit} satisfies Partial<${shellType}>;`
  );
  lines.push(`${indent}memo.set(resource.toString(), shell);`);
  lines.push(
    narrowPayload
      ? `${indent}const payload = inputPayload as ${printTypeExpr(body.payloadType)};`
      : `${indent}const payload = inputPayload;`
  );

  for (const fieldName of body.selectedFields) {
    lines.push(`${indent}shell.${fieldName} = payload.${fieldName};`);
  }

  for (const plannedExpansion of body.expansions) {
    const expansion = plannedExpansion.source;
    const value = emitExpansionValue(expansion, resources, queryName);
    const indented = value.includes("\n")
      ? value
          .split("\n")
          .map((line, i) => (i === 0 ? line : `${indent}${line}`))
          .join("\n")
      : value;
    lines.push(
      `${indent}shell.${expansion.alias} = ${indented} as ${shellType}[${JSON.stringify(expansion.alias)}];`
    );
  }

  lines.push(`${indent}return shell as ${shellType};`);
  return lines.join("\n");
}

export function emitProjectOnBody(
  projectionPlan: ProjectionPlan,
  resources: ResourceIndex,
  queryName: string,
  resourceTag?: string
): string {
  const projection = projectionPlan.source;
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
    return [`    memo.set(resource.toString(), inputPayload);`, `    return inputPayload;`].join(
      "\n"
    );
  }

  return emitShellBody(
    projection.resource,
    projectionPlan.flatBody!,
    projectionTypeName(queryName, projection.resource),
    resources,
    queryName,
    "    ",
    false,
    resourceTag
  );
}

function emitArmShell(
  projection: ProjectionPlan,
  arm: PlannedProjectionBody,
  shellType: string,
  resources: ResourceIndex,
  queryName: string,
  indent: string,
  resourceTag?: string
): string {
  return emitShellBody(
    projection.source.resource,
    arm,
    shellType,
    resources,
    queryName,
    indent,
    true,
    resourceTag
  );
}

/**
 * Ordered `if` / `else if` on when-arms, ending in the required `default` body.
 */
export function emitArmedProjectOnBody(
  projectionPlan: ProjectionPlan,
  resources: ResourceIndex,
  queryName: string,
  resourceTag?: string
): string {
  const projection = projectionPlan.source;
  const arms = projectionPlan.arms;
  if (projection.arms === null) {
    throw new Error("emitProjections: emitArmedProjectOnBody called without arms");
  }
  const defaultArm = projectionPlan.defaultArm;
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

  const defaultType = projectionVariantTypeName(queryName, projection.resource, "Default");
  const exhaustiveError = `project${queryName}: exhaustive projection default reached for ${projection.resource}`;

  const branches: string[] = [];
  for (const arm of arms) {
    if (!arm.reachable) continue;
    const cond = emitExpr(arm.source.when, projectionExprScope);
    const keyword = branches.length === 0 ? "if" : "} else if";
    const disc = projectionArmDiscriminant(arm.source.when, projection.binding);
    const armType = projectionVariantTypeName(
      queryName,
      projection.resource,
      disc ?? `Arm${arm.index}`
    );
    branches.push(
      [
        `    ${keyword} (${cond}) {`,
        emitArmShell(projectionPlan, arm, armType, resources, queryName, "      ", resourceTag),
      ].join("\n")
    );
  }
  if (branches.length === 0) {
    return defaultArm.reachable
      ? emitArmShell(
          projectionPlan,
          defaultArm,
          defaultType,
          resources,
          queryName,
          "    ",
          resourceTag
        )
      : `    throw new Error(${JSON.stringify(exhaustiveError)});`;
  }

  const defaultBody = defaultArm.reachable
    ? emitArmShell(
        projectionPlan,
        defaultArm,
        defaultType,
        resources,
        queryName,
        "      ",
        resourceTag
      )
    : `      throw new Error(${JSON.stringify(exhaustiveError)});`;
  branches.push([`    } else {`, defaultBody, `    }`].join("\n"));
  return [`    const payload = inputPayload;`, branches.join("\n")].join("\n");
}

export function emitProjectOnHelper(
  projection: ProjectionPlan,
  resources: ResourceIndex,
  queryName: string,
  resourceTag?: string
): string {
  const source = projection.source;
  const name = projectOnFnName(source.resource);
  const body =
    projection.kind === "armed"
      ? emitArmedProjectOnBody(projection, resources, queryName, resourceTag)
      : emitProjectOnBody(projection, resources, queryName, resourceTag);
  const resourceType = `ReturnType<typeof ${ariFactoryName(source.resource)}>`;
  const payloadType = payloadTypeName(source.resource);
  const resultType = projectionTypeName(queryName, source.resource);
  return [
    `  const ${name} = (resource: ${resourceType}, inputPayload: ${payloadType}): ${resultType} => {`,
    body,
    `  };`,
  ].join("\n");
}
