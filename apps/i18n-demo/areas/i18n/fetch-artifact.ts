import fs from "node:fs/promises";
import path from "node:path";
import type { FetchArtifact } from "@xndrjs/i18n";
import { areasArtifactFileName } from "./artifact-path";

/**
 * Server `fetchImpl`: read Next `public/i18n/translations` from disk
 */
export const areasFetchArtifact: FetchArtifact = async (id) => {
  const fileName = areasArtifactFileName(id);
  const filePath = path.join(process.cwd(), "public/i18n/translations", fileName);
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text) as unknown;
};
