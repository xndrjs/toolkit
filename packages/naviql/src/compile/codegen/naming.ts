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
