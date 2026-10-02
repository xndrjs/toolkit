import { ari, s, type AddressableResourceIdentifier } from "@xndrjs/addressable-resources";

const idKeySchema = s.object({ id: s.string() });

/** Builds a test ARI factory whose key is `{ id }`. */
export function testAriFactory<const Type extends string>(type: Type) {
  return ari(type, idKeySchema);
}

/** Builds a test ARI with an `{ id }` key. */
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

/** Reads the `id` key field of a test ARI without narrowing to a factory type. */
export function idOf(resource: AddressableResourceIdentifier): string {
  return String(resource.key.id);
}
