import { HeroShape, type Hero } from "../../domain/index.js";
import { flattenHeroEntryFields, HeroEntrySchema } from "../cms/generated/contentful.schemas.js";
import { mapAsset } from "./asset.mapper.js";
import type { MapperContext } from "./mapper-context.js";

export function mapHero(context: MapperContext, raw: unknown): Hero {
  const entry = HeroEntrySchema.parse(raw);
  const fields = flattenHeroEntryFields(entry.fields, context.locale);
  if (!fields.image) {
    throw new Error(`Hero ${entry.sys.id} is missing a required image link`);
  }

  return HeroShape.create({
    type: "Hero",
    id: entry.sys.id,
    title: fields.title,
    image: mapAsset(context, fields.image),
  });
}
