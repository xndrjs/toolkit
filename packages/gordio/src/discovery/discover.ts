import { readFile } from "node:fs/promises";
import path from "node:path";

import { ArchitectureGraphError } from "../graph/errors";
import { mergeGraphFragments } from "../graph/merge";
import type { ArchitectureGraph, GraphFragment } from "../graph/types";

import { collectFiles } from "./collect-files";
import { createId } from "./create-id";
import { matchesAny, normalizePatterns } from "./glob";
import type { DiscoveryContext, DiscoveryOptions, FileParserResult } from "./types";

export async function discoverArchitectureGraph(
  options: DiscoveryOptions
): Promise<ArchitectureGraph> {
  const rootDir = path.resolve(options.rootDir);
  const files = await collectFiles(rootDir);
  const fragments: GraphFragment[] = [];
  const context: DiscoveryContext = { rootDir, createId };
  const globalExcludePatterns = normalizePatterns(options.exclude);

  for (const matcher of options.matchers) {
    const includePatterns = normalizePatterns(matcher.include);
    const excludePatterns = normalizePatterns(matcher.exclude);

    for (const relativePath of files) {
      if (
        matchesAny(relativePath, globalExcludePatterns) ||
        !matchesAny(relativePath, includePatterns) ||
        matchesAny(relativePath, excludePatterns)
      ) {
        continue;
      }

      const absolutePath = path.join(rootDir, relativePath);
      const contents = await readFile(absolutePath, "utf8");

      try {
        const result = await matcher.parse(
          {
            absolutePath,
            relativePath,
            contents,
            matcherId: matcher.id,
          },
          context
        );

        fragments.push(...normalizeParserResult(result));
      } catch (error) {
        throw new ArchitectureGraphError(
          `Discovery matcher "${matcher.id}" failed for "${relativePath}": ${formatCause(error)}`
        );
      }
    }
  }

  return mergeGraphFragments(fragments);
}

function normalizeParserResult(result: FileParserResult): GraphFragment[] {
  if (!result) {
    return [];
  }

  return Array.isArray(result) ? result : [result];
}

function formatCause(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
