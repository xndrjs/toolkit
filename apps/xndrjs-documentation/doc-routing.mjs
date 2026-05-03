/**
 * Canonical docs tree for stable `/latest/...` URLs (middleware in dev + `dist/_redirects` at build).
 * When v1 becomes the default line, set this to `"v1"` and add matching content under `src/content/docs/v1/`.
 * Keep `docVersions[0].slugPrefix` in `src/starlight-versions.ts` in sync (runtime check).
 *
 * Note: `_redirects` is honored by Netlify, Cloudflare Pages, and similar hosts. Plain GitHub Pages
 * does not apply it; use another redirect mechanism or link to `/v0/...` directly there.
 */
export const latestDocPrefix = "v0";
