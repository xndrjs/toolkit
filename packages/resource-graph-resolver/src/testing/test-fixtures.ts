import { ari, s } from "@xndrjs/application-resources";

const idKeySchema = s.object({ id: s.string() });

/** Builds a test ARI with a single `{ id }` object key part. */
export function testAri<const Type extends string>(type: Type, id: string) {
  return ari(type, idKeySchema)({ id });
}
