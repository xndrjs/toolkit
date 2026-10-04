import type { SourceSpan, TypeExpr } from "../ir";
import { formatType } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";

/**
 * True when `type` mentions an opaque anywhere (object fields, arrays,
 * nullables, unions). Used for identity / query params / datasource context.
 */
export function containsOpaqueType(type: TypeExpr): boolean {
  switch (type.kind) {
    case "opaqueRef":
      return true;
    case "nullable":
    case "array":
      return containsOpaqueType(type.of);
    case "object":
      return type.fields.some((field) => containsOpaqueType(field.type));
    case "union":
      return type.members.some(containsOpaqueType);
    default:
      return false;
  }
}

/**
 * True when the type itself is an opaque leaf (after unwrapping nullable /
 * array / union). Does not walk into object fields — used for `refers` fields.
 */
export function isOpaqueLeafType(type: TypeExpr): boolean {
  switch (type.kind) {
    case "opaqueRef":
      return true;
    case "nullable":
    case "array":
      return isOpaqueLeafType(type.of);
    case "union":
      return type.members.some(isOpaqueLeafType);
    default:
      return false;
  }
}

/**
 * Emit `code` when `type` contains an opaque. Callers should resolve
 * `typeProjection` first so projections to opaque fields are caught.
 */
export function checkNoOpaqueInType(
  type: TypeExpr,
  path: string,
  code: string,
  message: string,
  sink: DiagnosticSink,
  span: SourceSpan | null = type.span
): boolean {
  if (!containsOpaqueType(type)) return false;
  sink.push({ code, message, path, span });
  return true;
}

/** Message helper for positional opaque bans. */
export function opaqueTypeBanMessage(type: TypeExpr, where: string): string {
  return `Opaque type ${formatType(type)} is not allowed in ${where}`;
}
