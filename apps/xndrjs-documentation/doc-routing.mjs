/**
 * Canonical docs tree for stable `/latest/...` URLs.
 * `src/pages/latest/` emits static HTML that redirects to `/${latestDocPrefix}/...` (same in dev and static deploy).
 * When v1 becomes the default line, set this to `"v1"` and add matching content under `src/content/docs/v1/`.
 * Keep `docVersions[0].slugPrefix` in `src/starlight-versions.ts` in sync (runtime check).
 */
export const latestDocPrefix = "v0";
