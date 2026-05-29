export const DEFAULT_ENVIRONMENT_ID = "master";

/** Shared CMA credentials for fetch helpers. */
export interface FetchCmaOptions {
  spaceId: string;
  accessToken: string;
  /** @default "master" */
  environmentId?: string;
}

export type FetchContentTypesOptions = FetchCmaOptions;
export type FetchLocalesOptions = FetchCmaOptions;

export function resolveEnvironmentId(environmentId?: string): string {
  return environmentId ?? DEFAULT_ENVIRONMENT_ID;
}
