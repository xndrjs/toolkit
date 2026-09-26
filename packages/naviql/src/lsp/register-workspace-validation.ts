/**
 * Hook document / watched-file changes to multi-file compile validation.
 * Updates the shared {@link SemanticSnapshotCache} on the same debounce as diagnostics.
 */
import { fileURLToPath } from "node:url";

import { URI, type LangiumDocument } from "langium";
import type { LangiumSharedServices } from "langium/lsp";

import { diagnosticsToLsp } from "./diagnostics-to-lsp";
import { createSemanticSnapshotCache, type SemanticSnapshotCache } from "./semantic-snapshot";
import { validateWorkspace } from "./workspace-validate";

const DEBOUNCE_MS = 150;

function workspaceFolderPaths(services: LangiumSharedServices): string[] {
  const folders = services.workspace.WorkspaceManager.workspaceFolders;
  if (!folders) {
    return [];
  }
  const paths: string[] = [];
  for (const folder of folders) {
    try {
      if (folder.uri.startsWith("file:")) {
        paths.push(fileURLToPath(folder.uri));
      }
    } catch {
      // skip non-file folders
    }
  }
  return paths;
}

function isNaviQlUri(uri: string): boolean {
  return uri.endsWith(".naviql");
}

function documentsByUriFor(
  services: LangiumSharedServices,
  uris: Iterable<string>
): Map<string, LangiumDocument> {
  const out = new Map<string, LangiumDocument>();
  const langiumDocs = services.workspace.LangiumDocuments;
  for (const uri of uris) {
    try {
      const doc = langiumDocs.getDocument(URI.parse(uri));
      if (doc) {
        out.set(uri, doc);
      }
    } catch {
      // skip unparseable URIs
    }
  }
  return out;
}

export type RegisterWorkspaceValidationOptions = {
  /** Shared cache for IntelliSense providers; created if omitted. */
  semanticSnapshot?: SemanticSnapshotCache;
};

/**
 * Register multi-file workspace validation on the Langium shared services.
 *
 * Call before {@link startLanguageServer} so `onInitialize` / `onInitialized`
 * listeners are in place when the client connects.
 *
 * @returns The semantic snapshot cache updated on each successful validate.
 */
export function registerWorkspaceValidation(
  services: LangiumSharedServices,
  options: RegisterWorkspaceValidationOptions = {}
): SemanticSnapshotCache {
  const semanticSnapshot = options.semanticSnapshot ?? createSemanticSnapshotCache();
  const connection = services.lsp.Connection;
  if (!connection) {
    return semanticSnapshot;
  }

  let triggerUri: string | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let runId = 0;
  /** URIs we last published diagnostics for (so we can clear stale ones). */
  let publishedUris = new Set<string>();

  const schedule = (uri?: string): void => {
    if (uri && isNaviQlUri(uri)) {
      triggerUri = uri;
    }
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void runValidation();
    }, DEBOUNCE_MS);
  };

  const runValidation = async (): Promise<void> => {
    const documents = services.workspace.TextDocuments;
    const openSources = new Map<string, string>();
    for (const doc of documents.all()) {
      if (isNaviQlUri(doc.uri)) {
        openSources.set(doc.uri, doc.getText());
      }
    }

    const trigger =
      triggerUri ??
      [...openSources.keys()][0] ??
      (services.workspace.WorkspaceManager.workspaceFolders?.[0]
        ? `${services.workspace.WorkspaceManager.workspaceFolders[0]!.uri}/.`
        : undefined);

    if (!trigger) {
      return;
    }

    const id = ++runId;
    let result;
    try {
      result = await validateWorkspace({
        triggerUri: trigger,
        openSources,
        workspaceFolders: workspaceFolderPaths(services),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      connection.console.error(`naviql: workspace validation failed: ${message}`);
      if (id === runId) {
        semanticSnapshot.set(undefined);
      }
      return;
    }

    if (id !== runId) {
      return;
    }

    if (result.semantic) {
      semanticSnapshot.set({
        program: result.semantic.program,
        scalars: result.semantic.scalars,
        resources: result.semantic.resources,
        documentsByUri: documentsByUriFor(services, result.sourcesByUri.keys()),
      });
    } else {
      semanticSnapshot.set(undefined);
    }

    const nextPublished = new Set<string>();

    for (const [uri, diagnostics] of result.byUri) {
      const source = result.sourcesByUri.get(uri) ?? openSources.get(uri) ?? "";
      connection.sendDiagnostics({
        uri,
        diagnostics: diagnosticsToLsp(diagnostics, uri, source),
      });
      nextPublished.add(uri);
    }

    for (const uri of publishedUris) {
      if (!nextPublished.has(uri)) {
        connection.sendDiagnostics({ uri, diagnostics: [] });
      }
    }
    publishedUris = nextPublished;
  };

  services.lsp.LanguageServer.onInitialized(() => {
    schedule(triggerUri);
  });

  const documents = services.workspace.TextDocuments;
  documents.onDidOpen((event) => schedule(event.document.uri));
  documents.onDidChangeContent((event) => schedule(event.document.uri));
  documents.onDidClose((event) => schedule(event.document.uri));

  services.lsp.DocumentUpdateHandler.onWatchedFilesChange((params) => {
    const naviqlChange = params.changes.find((c) => isNaviQlUri(c.uri));
    schedule(naviqlChange?.uri);
  });

  return semanticSnapshot;
}
