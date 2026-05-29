import type { z } from "zod";

/** Override map for Contentful `Object` fields keyed as `{contentTypeId}.{fieldId}`. */
export interface ContentfulToZodConfig {
  objects?: Record<string, z.ZodType>;
}

export function defineConfig(config: ContentfulToZodConfig): ContentfulToZodConfig {
  return config;
}
