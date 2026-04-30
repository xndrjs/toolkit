/**
 * Documentation version roots. Add new entries when you introduce `v1/`, `v2/`, etc.
 * `slugPrefix` must match the folder name under `src/content/docs/`.
 */
export const docVersions = [{ slugPrefix: "v0", label: "v0 (preview)" }] as const;

export type DocVersionId = (typeof docVersions)[number]["slugPrefix"];
