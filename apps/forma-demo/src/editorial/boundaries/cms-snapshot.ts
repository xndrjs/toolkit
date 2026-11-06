import { readFile } from "node:fs/promises";
import { boundary } from "@xndrjs/forma";
import { z } from "zod";

const SnapshotEntrySchema = z
  .object({
    entry_id: z.string().min(1),
    canonical_path: z.string().startsWith("/"),
    publication_state: z.enum(["published", "draft"]),
    last_modified_at: z.string().datetime({ offset: true }),
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

export const ReadSnapshot = CmsSnapshot.intent("readSnapshot").contract<
  void,
  readonly SnapshotEntry[],
  never
>();

/** Reads a real local artifact once, when this Provider is first materialized. */
export const ReadSnapshotProvider = ReadSnapshot.provide.perComposition().with(async ({ out }) => {
  const snapshotUrl = new URL("../fixtures/cms-snapshot.json", import.meta.url);
  const entries = parseSnapshot(await readFile(snapshotUrl, "utf8"));

  return function readSnapshot() {
    return out.success(entries);
  };
});
