/**
 * Factory / type names for resource codegen.
 * `Post` → `postAri`, `PostPayload`, `PostResource`.
 */

/** Lowercase the first character (`Post` → `post`). */
export function uncapitalize(name: string): string {
  if (name.length === 0) {
    return name;
  }
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** `Post` → `postAri` */
export function ariFactoryName(resourceName: string): string {
  return `${uncapitalize(resourceName)}Ari`;
}

/** `Post` → `PostPayload` */
export function payloadTypeName(resourceName: string): string {
  return `${resourceName}Payload`;
}

/** `Post` → `PostResource` */
export function resourceTypeName(resourceName: string): string {
  return `${resourceName}Resource`;
}

/** `PostDetail` → `createPostDetailStrategy` */
export function strategyFactoryName(queryName: string): string {
  return `create${queryName}Strategy`;
}

/** `PostDetail` → `PostDetailParams` */
export function paramsTypeName(queryName: string): string {
  return `${queryName}Params`;
}

/** `PostDetail` → `PostDetailExecutionContext` */
export function executionContextTypeName(queryName: string): string {
  return `${queryName}ExecutionContext`;
}

/** `PostDetail` → `projectPostDetail` */
export function projectFnName(queryName: string): string {
  return `project${queryName}`;
}

/** `PostDetail` → `resolvePostDetail` */
export function resolveFnName(queryName: string): string {
  return `resolve${queryName}`;
}

/** `PostDetail` → `postDetail` (projected aggregate field on resolve result) */
export function resolveResultFieldName(queryName: string): string {
  return uncapitalize(queryName);
}

/** `PostDetail` → `ResolvePostDetailResult` */
export function resolveResultTypeName(queryName: string): string {
  return `Resolve${queryName}Result`;
}

/** `PostDetail` → `PostDetailResult` */
export function queryResultTypeName(queryName: string): string {
  return `${queryName}Result`;
}

/** `PostDetail` + `Post` → `PostDetail_Post` (query-scoped projection type) */
export function projectionTypeName(queryName: string, resourceName: string): string {
  return `${queryName}_${resourceName}`;
}

/**
 * `PostDetail` + `Entry` + `"Hero"` → `PostDetail_Entry_Hero`
 * (one arm of an armed `on` projection).
 */
export function projectionVariantTypeName(
  queryName: string,
  resourceName: string,
  variant: string
): string {
  return `${queryName}_${resourceName}_${variant}`;
}

/** Aggregate execution context merged from all datasource `context` blocks. */
export const ZIEL_EXECUTION_CONTEXT_TYPE_NAME = "ZielExecutionContext";

/** `PageDetail` → `createPageDetailDataSources` */
export function dataSourcesFactoryName(queryName: string): string {
  return `create${queryName}DataSources`;
}

/** `CmsSource` → `CmsSourceContext` */
export function datasourceContextTypeName(datasourceName: string): string {
  return `${datasourceName}Context`;
}

/** `CmsSource` → `CmsSourceConfig` (exported from `resources.ts` for query factories). */
export function datasourceConfigTypeName(datasourceName: string): string {
  return `${datasourceName}Config`;
}

/**
 * PascalCase / camelCase identifier → kebab-case slug.
 * `PageDetail` → `page-detail`; `XMLParser` → `xml-parser`.
 */
export function pascalToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** `PageDetail` → `page-detail.query.ts` */
export function queryModuleFileName(queryName: string): string {
  return `${pascalToKebab(queryName)}.query.ts`;
}

/**
 * Map each query name to its flat relative path under `out/`.
 * Rejects collisions when two IR names kebab-slug to the same file.
 */
export function resolveQueryModulePaths(queryNames: readonly string[]): Map<string, string> {
  const paths = new Map<string, string>();
  const owners = new Map<string, string>();

  for (const queryName of queryNames) {
    const relativePath = queryModuleFileName(queryName);
    const existing = owners.get(relativePath);
    if (existing !== undefined) {
      throw new Error(
        `Query module filename collision: '${existing}' and '${queryName}' both map to '${relativePath}'`
      );
    }
    owners.set(relativePath, queryName);
    paths.set(queryName, relativePath);
  }

  return paths;
}
