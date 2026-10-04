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
query PostDetail(postId: PostId, locale: Locale) {
  context {
    locale
  }

  root Post(
    id: postId,
    locale: locale
  )

  on Post p {
    id
    title
  }
}
`;

const QUERY_UNKNOWN = `
query PostDetail(postId: PostId, locale: Locale) {
  context {
    locale
  }

  root MissingPost(
    id: postId,
    locale: locale
  )

  on Post p {
    id
    title
  }
}
`;

/** Minimal project config so multi-file collect is scoped to the temp dir. */
const PROJECT_CONFIG = `export default { include: ["**/*.ziel"] };
`;

describe("validateWorkspace", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function setupTwoFiles(
    querySource: string,
    options: { withConfig?: boolean } = {}
  ): {
    root: string;
    resourcesUri: string;
    queryUri: string;
    resourcesPath: string;
    queryPath: string;
  } {
    const { withConfig = true } = options;
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-lsp-"));
    const resourcesPath = join(tempDir, "resources.ziel");
    const queryPath = join(tempDir, "query.ziel");
    writeFileSync(resourcesPath, RESOURCES);
    writeFileSync(queryPath, querySource);
    if (withConfig) {
      writeFileSync(join(tempDir, "ziel.config.ts"), PROJECT_CONFIG);
    }
    return {
      root: tempDir,
      resourcesUri: pathToFileURL(resourcesPath).href,
      queryUri: pathToFileURL(queryPath).href,
      resourcesPath,
      queryPath,
    };
  }

  it("merges resource file A + query file B without false UNKNOWN_RESOURCE", async () => {
    const { root, resourcesUri, queryUri } = setupTwoFiles(QUERY_OK);

    const result = await validateWorkspace({
      triggerUri: queryUri,
      openSources: new Map(),
      workspaceFolders: [root],
    });

    expect(result.usedConfig).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(result.byUri.get(resourcesUri)).toEqual([]);
    expect(result.byUri.get(queryUri)).toEqual([]);
    expect(result.semantic).toBeDefined();
    expect(result.semantic!.scalars.has("PostId")).toBe(true);
    expect(result.semantic!.scalars.has("Locale")).toBe(true);
    expect(result.semantic!.opaques.size).toBe(0);
    expect(result.semantic!.resources.has("Post")).toBe(true);
    expect(result.semantic!.program.resources).toHaveLength(1);
    expect(result.semantic!.program.queries).toHaveLength(1);
  });

  it("exposes cross-file opaque tables on the semantic snapshot", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-lsp-opaque-"));
    const opaquesPath = join(tempDir, "opaques.ziel");
    const resourcesPath = join(tempDir, "resources.ziel");
    writeFileSync(opaquesPath, `opaque RichDocument;\n`);
    writeFileSync(
      resourcesPath,
      `
scalar PostId on string;
resource Post(id: PostId): {
  id
  body: RichDocument
}
`
    );
    writeFileSync(join(tempDir, "ziel.config.ts"), PROJECT_CONFIG);

    const result = await validateWorkspace({
      triggerUri: pathToFileURL(resourcesPath).href,
      openSources: new Map(),
      workspaceFolders: [tempDir],
    });

    expect(result.byUri.get(pathToFileURL(resourcesPath).href)).toEqual([]);
    expect(result.semantic).toBeDefined();
    expect(result.semantic!.opaques.has("RichDocument")).toBe(true);
    expect(result.semantic!.opaques.get("RichDocument")!.span?.uri).toBe(
      pathToFileURL(opaquesPath).href
    );
  });

  it("lowers a fragment declared in a third workspace file before checking", async () => {
    const { root, resourcesUri, queryUri } = setupTwoFiles(`
      query PostDetail(postId: PostId, locale: Locale) {
        context {
    locale
  }
        root Post(id: postId, locale: locale)
        on Post post { ...PostSummary }
      }
    `);
    const fragmentPath = join(root, "fragment.ziel");
    const fragmentUri = pathToFileURL(fragmentPath).href;
    writeFileSync(fragmentPath, `fragment PostSummary on Post post { id title }`);

    const result = await validateWorkspace({
      triggerUri: queryUri,
      openSources: new Map(),
      workspaceFolders: [root],
    });

    expect(result.byUri.get(resourcesUri)).toEqual([]);
    expect(result.byUri.get(fragmentUri)).toEqual([]);
    expect(result.byUri.get(queryUri)).toEqual([]);
    expect(result.semantic?.program.queries[0]?.projections[0]?.selectedFields).toEqual([
      "id",
      "title",
    ]);
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

  it("without ziel.config, validates only the trigger file (no workspace-root glob)", async () => {
    const { root, queryUri, queryPath, resourcesUri } = setupTwoFiles(QUERY_OK, {
      withConfig: false,
    });

    const result = await validateWorkspace({
      triggerUri: queryUri,
      openSources: new Map(),
      workspaceFolders: [root],
    });

    expect(result.usedConfig).toBe(false);
    expect(result.files).toEqual([queryPath]);
    expect(result.byUri.has(resourcesUri)).toBe(false);

    // Query alone cannot see Post / Locale from the sibling resources file.
    const queryDiags = result.byUri.get(queryUri) ?? [];
    expect(queryDiags.some((d) => d.code === "UNKNOWN_RESOURCE")).toBe(true);
  });

  it("without ziel.config, does not merge sibling files that redefine the same scalar", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-lsp-"));
    const aPath = join(tempDir, "a.ziel");
    const bPath = join(tempDir, "b.ziel");
    writeFileSync(aPath, `scalar Locale on string;\nresource A(id: string): { id }\n`);
    writeFileSync(bPath, `scalar Locale on string;\nresource B(id: string): { id }\n`);
    const aUri = pathToFileURL(aPath).href;

    const result = await validateWorkspace({
      triggerUri: aUri,
      openSources: new Map(),
      workspaceFolders: [tempDir],
    });

    expect(result.usedConfig).toBe(false);
    expect(result.files).toEqual([aPath]);
    expect(result.byUri.get(aUri)).toEqual([]);
  });

  it("leaves semantic undefined when the only file has syntax errors", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-lsp-"));
    const brokenPath = join(tempDir, "broken.ziel");
    writeFileSync(brokenPath, `scalar Locale on\n`);
    writeFileSync(join(tempDir, "ziel.config.ts"), PROJECT_CONFIG);
    const brokenUri = pathToFileURL(brokenPath).href;

    const result = await validateWorkspace({
      triggerUri: brokenUri,
      openSources: new Map(),
      workspaceFolders: [tempDir],
    });

    expect(result.semantic).toBeUndefined();
    const diags = result.byUri.get(brokenUri) ?? [];
    expect(diags.some((d) => d.code === "SYNTAX_ERROR")).toBe(true);
  });

  it("publishes DUPLICATE_SELECTED_FIELD from lower (not only checkProgram)", async () => {
    const queryWithDup = `
query PostDetail(postId: PostId, locale: Locale) {
  context {
    locale
  }

  root Post(
    id: postId,
    locale: locale
  )

  on Post p {
    id
    title
    id
  }
}
`;
    const { root, queryUri } = setupTwoFiles(queryWithDup);

    const result = await validateWorkspace({
      triggerUri: queryUri,
      openSources: new Map(),
      workspaceFolders: [root],
    });

    const queryDiags = result.byUri.get(queryUri) ?? [];
    const dup = queryDiags.filter((d) => d.code === "DUPLICATE_SELECTED_FIELD");
    expect(dup).toHaveLength(1);
    expect(dup[0]!.message).toContain("id");
    expect(dup[0]!.span).toBeTruthy();
    expect(dup[0]!.span!.end).toBeGreaterThan(dup[0]!.span!.start);
  });
});
