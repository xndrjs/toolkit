import type { ResourceConstruction } from "../../../ir";
import { emitExpr } from "./emit-expr";
import { ariFactoryName } from "../naming";

/**
 * Lower a `ResourceConstruction` to a TypeScript ARI factory call.
 *
 * Arg order follows IR `args` (named args as written). Example:
 * `User(id: p.authorId)` → `userAri({ id: payload.authorId })`.
 */
export function emitConstruction(construction: ResourceConstruction): string {
  const factory = ariFactoryName(construction.resource);
  if (construction.args.length === 0) {
    return `${factory}({})`;
  }
  const entries = construction.args.map((arg) => `${arg.name}: ${emitExpr(arg.value)}`);
  return `${factory}({ ${entries.join(", ")} })`;
}
