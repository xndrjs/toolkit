/**
 * Multi-file workspace validation (headless — no VS Code / LanguageClient).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { diagnosticsToLsp } from "./diagnostics-to-lsp";
import { validateWorkspace } from "./workspace-validate";

const RESOURCES = `
scalar PostId on string;
scalar Locale on string;

resource Post(id: PostId, locale: Locale): {
  id
  title: string
}
`;

const QUERY_OK = `
query PostDetail(postId: PostId) {
  context {
    locale: Locale
  }

  root Post(
    id: postId,
    locale: context.locale
  )

  on Post p {
    id
    title
  }
}
`;

const QUERY_UNKNOWN = `
query PostDetail(postId: PostId) {
  context {
    locale: Locale
  }

  root MissingPost(
    id: postId,
    locale: context.locale
  )

  on Post p {
    id
    title
  }
}
`;

describe("validateWorkspace", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function setupTwoFiles(querySource: string): {
    root: string;
    resourcesUri: string;
    queryUri: string;
  } {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-naviql-lsp-"));
    const resourcesPath = join(tempDir, "resources.naviql");
    const queryPath = join(tempDir, "query.naviql");
    writeFileSync(resourcesPath, RESOURCES);
    writeFileSync(queryPath, querySource);
    return {
      root: tempDir,
      resourcesUri: pathToFileURL(resourcesPath).href,
      queryUri: pathToFileURL(queryPath).href,
    };
  }

  it("merges resource file A + query file B without false UNKNOWN_RESOURCE", async () => {
    const { root, resourcesUri, queryUri } = setupTwoFiles(QUERY_OK);

    const result = await validateWorkspace({
      triggerUri: queryUri,
      openSources: new Map(),
      workspaceFolders: [root],
    });

    expect(result.files).toHaveLength(2);
    expect(result.byUri.get(resourcesUri)).toEqual([]);
    expect(result.byUri.get(queryUri)).toEqual([]);
  });

  it("reports UNKNOWN_RESOURCE with a range in the query file only", async () => {
    const { root, resourcesUri, queryUri } = setupTwoFiles(QUERY_UNKNOWN);

    const result = await validateWorkspace({
      triggerUri: queryUri,
      openSources: new Map(),
      workspaceFolders: [root],
    });

    expect(result.byUri.get(resourcesUri)).toEqual([]);

    const queryDiags = result.byUri.get(queryUri) ?? [];
    const unknown = queryDiags.filter((d) => d.code === "UNKNOWN_RESOURCE");
    expect(unknown.length).toBeGreaterThanOrEqual(1);

    for (const diagnostic of unknown) {
      expect(diagnostic.span?.uri).toBe(queryUri);
      expect(diagnostic.span!.end).toBeGreaterThan(diagnostic.span!.start);
    }

    const source = result.sourcesByUri.get(queryUri)!;
    const lsp = diagnosticsToLsp(unknown, queryUri, source);
    expect(lsp.length).toBe(unknown.length);
    for (const d of lsp) {
      expect(d.code).toBe("UNKNOWN_RESOURCE");
      expect(
        d.range.end.line > d.range.start.line || d.range.end.character > d.range.start.character
      ).toBe(true);
    }
  });

  it("prefers open editor buffers over disk for the triggering file", async () => {
    const { root, queryUri } = setupTwoFiles(QUERY_OK);

    // Disk is valid; open buffer introduces an unknown root resource.
    const result = await validateWorkspace({
      triggerUri: queryUri,
      openSources: new Map([[queryUri, QUERY_UNKNOWN]]),
      workspaceFolders: [root],
    });

    const queryDiags = result.byUri.get(queryUri) ?? [];
    expect(queryDiags.some((d) => d.code === "UNKNOWN_RESOURCE")).toBe(true);
    expect(result.sourcesByUri.get(queryUri)).toBe(QUERY_UNKNOWN);
  });
});
