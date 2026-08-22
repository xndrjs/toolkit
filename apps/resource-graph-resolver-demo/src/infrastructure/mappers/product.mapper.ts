import { integrationProductAri } from "../integration/index.js";
import { ProductShape, type Product } from "../../domain/index.js";
import {
  flattenProductEntryFields,
  ProductEntrySchema,
} from "../cms/generated/contentful.schemas.js";
import type { MapperContext } from "./mapper-context.js";

export function mapProduct(context: MapperContext, raw: unknown): Product {
  const entry = ProductEntrySchema.parse(raw);
  const fields = flattenProductEntryFields(entry.fields, context.locale);
  if (fields.sku === null || fields.sku.length === 0) {
    throw new Error(`Product ${entry.sys.id} is missing sku`);
  }
  if (fields.title === null || fields.title.length === 0) {
    throw new Error(`Product ${entry.sys.id} is missing a title for locale ${context.locale}`);
  }

  const commercial = context.result.contentMap.get(
    integrationProductAri({ sku: fields.sku, locale: context.locale })
  );
  if (!commercial) {
    throw new Error(
      `ContentMap is missing integration.product for sku ${fields.sku} (entry ${entry.sys.id})`
    );
  }

  return ProductShape.create({
    type: "Product",
    id: entry.sys.id,
    sku: fields.sku,
    title: fields.title,
    description: fields.description,
    price: {
      type: "Price",
      amount: commercial.price.amount,
      currency: commercial.price.currency,
    },
    availability: commercial.inStock,
  });
}
