import { latestDocPrefix } from "../doc-routing.mjs";

export { latestDocPrefix };

/**
 * Documentation version roots. Add new entries when you introduce `v1/`, `v2/`, etc.
 * `slugPrefix` must match the folder name under `src/content/docs/`.
 * Keep `latestDocPrefix` in `doc-routing.mjs` aligned with the version you treat as default for `/latest/...` pages.
 */
export const docVersions = [{ slugPrefix: "v0", label: "v0 (preview)" }] as const;

if (latestDocPrefix !== docVersions[0].slugPrefix) {
  throw new Error(
    `doc-routing.latestDocPrefix ("${latestDocPrefix}") must match docVersions[0].slugPrefix ("${docVersions[0].slugPrefix}")`
  );
}

export type DocVersionId = (typeof docVersions)[number]["slugPrefix"];
