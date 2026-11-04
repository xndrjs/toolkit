import { readFile } from "node:fs/promises";
import { boundary } from "@xndrjs/forma";
import { z } from "zod";

export type SnapshotPathQuery = { readonly route_path: string };
export type SnapshotError = { readonly code: "ENTRY_NOT_FOUND" };

const SnapshotEntrySchema = z
  .object({
    entry_id: z.string().min(1),
    canonical_path: z.string().startsWith("/"),
  })
  .strict();

const SnapshotSchema = z.array(SnapshotEntrySchema);

export type SnapshotEntry = z.output<typeof SnapshotEntrySchema>;

function parseSnapshot(contents: string): readonly SnapshotEntry[] {
  const value: unknown = JSON.parse(contents);
  const parsed = SnapshotSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid CMS snapshot", { cause: parsed.error });
  }
  return parsed.data;
}

export const CmsSnapshot = boundary("cms-snapshot");

export const FindSnapshotEntry = CmsSnapshot.intent("findEntryByPath").contract<
  SnapshotPathQuery,
  SnapshotEntry,
  SnapshotError
>();

/** Reads a real local artifact once, when this Provider is first materialized. */
export const FindSnapshotEntryProvider = FindSnapshotEntry.provide
  .perComposition()
  .with(async ({ out }) => {
    const snapshotUrl = new URL("../fixtures/cms-snapshot.json", import.meta.url);
    const entries = parseSnapshot(await readFile(snapshotUrl, "utf8"));
    const entriesByPath = new Map(entries.map((entry) => [entry.canonical_path, entry]));

    return function findEntry(query) {
      const entry = entriesByPath.get(query.route_path);
      return entry ? out.success(entry) : out.expectedError({ code: "ENTRY_NOT_FOUND" });
    };
  });
