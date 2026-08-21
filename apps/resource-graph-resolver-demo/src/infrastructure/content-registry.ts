import type { CmsContentRegistry } from "./cms/content-registry.js";
import type { IntegrationContentRegistry } from "./integration/content-registry.js";

/**
 * Demo ContentRegistry: union of CMS + integration source slices.
 * Field-level Entry typing happens after content-type parse/hydrate, not on the ARI.
 */
export type DemoContentRegistry = CmsContentRegistry & IntegrationContentRegistry;

export type { CmsContentRegistry } from "./cms/content-registry.js";
export type { IntegrationContentRegistry } from "./integration/content-registry.js";
