import { ari, s, type ApplicationResourceIdentifier } from "@xndrjs/application-resources";

const idKeySchema = s.object({ id: s.string() });

/** Builds a test ARI factory whose key is a single `{ id }` object part. */
export function testAriFactory<const Type extends string>(type: Type) {
  return ari(type, idKeySchema);
}

/** Builds a test ARI with a single `{ id }` object key part. */
export function testAri<const Type extends string>(type: Type, id: string) {
  return testAriFactory(type)({ id });
}

export const pageAri = testAriFactory("page");
export const heroAri = testAriFactory("hero");
export const menuAri = testAriFactory("menu");
export const footerAri = testAriFactory("footer");
export const assetAri = testAriFactory("asset");
export const productAri = testAriFactory("product");
export const orphanAri = testAriFactory("orphan");

/** Reads the `{ id }` key part of a test ARI without narrowing to a factory type. */
export function idOf(resource: ApplicationResourceIdentifier): string {
  const part = resource.key[0];
  if (typeof part === "object" && part !== null && "id" in part) {
    return String(part.id);
  }

  return String(part);
}
