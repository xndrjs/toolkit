/**
 * Resolve `refers` annotations from expand constructions and narrow armed
 * projection alias types to the matching variant union.
 */
import { expandPayloadObjectMembers } from "../../../check/discriminants";
import { createDiagnosticSink } from "../../../check/diagnostic";
import { resolvePathOnPayloadType } from "../../../check/expr-paths";
import { memberMatchesRefersPattern, type ObjectMember } from "../../../check/refers";
import { unwrapNullable, type ResourceTable } from "../../../check/symbols";
import type {
  Expr,
  FieldDecl,
  ProjectionArm,
  RefersTarget,
  ResourceConstruction,
  ResourceProjection,
  TypeExpr,
} from "../../../ir";
import { projectionArmDiscriminant } from "../shared";
import { projectionVariantTypeName } from "../naming";

/** Context needed to walk source fields for `refers` while printing expand aliases. */
export type ExpansionAliasContext = {
  /** Enclosing `on` payload (arm-narrowed when inside a when-arm). */
  sourcePayload: TypeExpr;
  /** Projectable query projections keyed by resource name. */
  projectionsByResource: Map<string, ResourceProjection>;
};

/**
 * Collect `refers` targets on source fields used by `construction` whose
 * `resource` matches the construction. Walks `payloadRef` / `itemRef` args
 * on `walkRoot` (enclosing payload or each-item element type).
 */
export function collectApplicableRefers(
  construction: ResourceConstruction,
  walkRoot: TypeExpr,
  resources: ResourceTable
): RefersTarget[] {
  const out: RefersTarget[] = [];
  for (const arg of construction.args) {
    const value = arg.value;
    if (value.kind !== "payloadRef" && value.kind !== "itemRef") {
      continue;
    }
    for (const field of resolveFieldDeclsOnType(value.path, walkRoot, resources)) {
      if (!field.refers) continue;
      for (const target of field.refers) {
        if (target.resource === construction.resource) {
          out.push(target);
        }
      }
    }
  }
  return out;
}

/**
 * Array element type of an `each` comprehension source, resolved against the
 * enclosing source payload. Returns `null` when the source is not a payload
 * path to an array.
 */
export function comprehensionElementType(
  source: Expr,
  sourcePayload: TypeExpr,
  resources: ResourceTable
): TypeExpr | null {
  if (source.kind !== "payloadRef" && source.kind !== "itemRef") {
    return null;
  }
  const sink = createDiagnosticSink();
  const resolved = resolvePathOnPayloadType(
    source.path,
    sourcePayload,
    "emit.refers",
    null,
    resources,
    sink
  );
  if (!resolved) return null;
  const unwrapped = unwrapNullable(resolved);
  return unwrapped.kind === "array" ? unwrapped.of : null;
}

/**
 * Object members of `targetResource` matched by any applicable refers pattern.
 */
export function membersMatchingApplicableRefers(
  targetResource: string,
  refers: RefersTarget[],
  resources: ResourceTable
): ObjectMember[] | null {
  const applicable = refers.filter((t) => t.resource === targetResource);
  if (applicable.length === 0) return null;

  const target = resources.get(targetResource);
  if (!target) return null;

  const matched: ObjectMember[] = [];
  const seen = new Set<ObjectMember>();
  for (const pattern of applicable) {
    const members = expandPayloadObjectMembers(target.payloadType, resources);
    if (members === null) return null;
    for (const member of members) {
      if (seen.has(member)) continue;
      if (memberMatchesRefersPattern(member, pattern.fields)) {
        seen.add(member);
        matched.push(member);
      }
    }
  }
  return matched;
}

/**
 * Narrow an armed `on R` projection alias using refers-matched members.
 * Returns `null` when narrowing does not apply (no refers / not armed / empty).
 * Throws when a matched member has no corresponding projection arm.
 */
export function printNarrowedArmedAliasType(
  queryName: string,
  targetName: string,
  matchedMembers: ObjectMember[],
  projection: ResourceProjection,
  resources: ResourceTable
): string | null {
  if (projection.arms === null || matchedMembers.length === 0) {
    return null;
  }

  const resource = resources.get(targetName);
  if (!resource) return null;

  const variantTypes: string[] = [];
  const coveredMembers = new Set<ObjectMember>();

  for (let i = 0; i < projection.arms.length; i++) {
    const arm = projection.arms[i]!;
    if (
      !armMatchesAnyMember(arm, projection.binding, matchedMembers, resource.payloadType, resources)
    ) {
      continue;
    }
    const disc = projectionArmDiscriminant(arm.when, projection.binding);
    const variant = disc ?? `Arm${i}`;
    const typeName = projectionVariantTypeName(queryName, targetName, variant);
    if (!variantTypes.includes(typeName)) {
      variantTypes.push(typeName);
    }
    for (const member of matchedMembers) {
      if (memberMatchesArm(member, arm, projection.binding, resource.payloadType, resources)) {
        coveredMembers.add(member);
      }
    }
  }

  const uncovered = matchedMembers.filter((m) => !coveredMembers.has(m));
  if (uncovered.length > 0) {
    const labels = uncovered.map(memberLabel).join(", ");
    throw new Error(
      `emitProjectionTypes: REFERS_ARM_NOT_PROJECTED: refers matches payload member(s) of '${targetName}' ` +
        `(${labels}) with no corresponding 'on ${targetName}' arm in query '${queryName}'`
    );
  }

  if (variantTypes.length === 0) {
    return null;
  }
  return variantTypes.join(" | ");
}

function armMatchesAnyMember(
  arm: ProjectionArm,
  binding: string,
  members: ObjectMember[],
  payloadType: TypeExpr,
  resources: ResourceTable
): boolean {
  return members.some((m) => memberMatchesArm(m, arm, binding, payloadType, resources));
}

function memberMatchesArm(
  member: ObjectMember,
  arm: ProjectionArm,
  binding: string,
  payloadType: TypeExpr,
  resources: ResourceTable
): boolean {
  const disc = projectionArmDiscriminant(arm.when, binding);
  if (disc !== null) {
    const narrowed = narrowPayloadObjectByDisc(payloadType, disc, resources);
    if (narrowed !== null) {
      return sameObjectMember(narrowed, member);
    }
    return memberTypeDiscriminant(member) === disc;
  }

  // No type discriminant on the arm — compare against the full (un-narrowed) payload
  // only when it is a single object equal to the member.
  const expanded = expandPayloadObjectMembers(payloadType, resources);
  if (expanded !== null && expanded.length === 1) {
    return sameObjectMember(expanded[0]!, member);
  }
  return false;
}

function narrowPayloadObjectByDisc(
  payloadType: TypeExpr,
  disc: string,
  resources: ResourceTable
): ObjectMember | null {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (members === null) return null;
  const matched = members.filter((member) => memberTypeDiscriminant(member) === disc);
  return matched.length === 1 ? matched[0]! : null;
}

function memberTypeDiscriminant(member: ObjectMember): string | null {
  const typeField = member.fields.find((f) => f.name === "type");
  return typeField?.type.kind === "stringLiteral" ? typeField.type.value : null;
}

function memberLabel(member: ObjectMember): string {
  const disc = memberTypeDiscriminant(member);
  return disc !== null ? `type=${JSON.stringify(disc)}` : "object";
}

function sameObjectMember(a: ObjectMember, b: ObjectMember): boolean {
  if (a === b) return true;
  const da = memberTypeDiscriminant(a);
  const db = memberTypeDiscriminant(b);
  if (da !== null && db !== null) {
    return da === db;
  }
  if (a.fields.length !== b.fields.length) return false;
  for (let i = 0; i < a.fields.length; i++) {
    if (a.fields[i]!.name !== b.fields[i]!.name) return false;
  }
  return true;
}

/**
 * Resolve `pathSegments` on a type to one or more `FieldDecl`s (union members
 * may contribute multiple decls for the same path).
 */
function resolveFieldDeclsOnType(
  pathSegments: string[],
  type: TypeExpr,
  resources: ResourceTable
): FieldDecl[] {
  if (pathSegments.length === 0) return [];

  const inner = unwrapNullable(type);

  if (inner.kind === "object") {
    const field = inner.fields.find((f) => f.name === pathSegments[0]);
    if (!field) return [];
    if (pathSegments.length === 1) return [field];
    return resolveFieldDeclsOnType(pathSegments.slice(1), field.type, resources);
  }

  if (inner.kind === "resourceRef") {
    const referenced = resources.get(inner.name);
    if (!referenced) return [];
    return resolveFieldDeclsOnType(pathSegments, referenced.payloadType, resources);
  }

  if (inner.kind === "union") {
    const fields: FieldDecl[] = [];
    for (const member of inner.members) {
      fields.push(...resolveFieldDeclsOnType(pathSegments, member, resources));
    }
    return fields;
  }

  return [];
}
