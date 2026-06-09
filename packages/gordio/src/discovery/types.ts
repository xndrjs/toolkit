import type { GraphFragment } from "../graph/types";

import type { createId } from "./create-id";

export interface DiscoveryOptions {
  rootDir: string;
  exclude?: string | string[];
  matchers: FileMatcher[];
}

export interface FileMatcher {
  id: string;
  include: string | string[];
  exclude?: string | string[];
  parse: FileParser;
}

export interface MatchedFile {
  absolutePath: string;
  relativePath: string;
  contents: string;
  matcherId: string;
}

export interface DiscoveryContext {
  rootDir: string;
  createId: typeof createId;
}

export type FileParserResult = GraphFragment | GraphFragment[] | undefined | void;

export type FileParser = (
  file: MatchedFile,
  context: DiscoveryContext
) => FileParserResult | Promise<FileParserResult>;
