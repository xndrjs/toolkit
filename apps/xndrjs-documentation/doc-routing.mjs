/**
 * Canonical docs tree for stable `/latest/...` URLs (middleware in dev + `dist/_redirects` at build).
 * When v1 becomes the default line, set this to `"v1"` and add matching content under `src/content/docs/v1/`.
 * Keep `docVersions[0].slugPrefix` in `src/starlight-versions.ts` in sync (runtime check).
 *
 * Note: `_redirects` (written at build) is honored by Netlify, Cloudflare Pages, and similar hosts.
 * Vercel ignores that file; keep `vercel.json` redirects in this app aligned with `latestDocPrefix`.
 * Plain GitHub Pages does not apply `_redirects`; use another redirect mechanism or link to `/v0/...` directly there.
 */
export const latestDocPrefix = "v0";
