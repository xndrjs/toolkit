import { DocumentState } from "langium";
import {
  startLanguageServer,
  type DefaultSharedModuleContext,
  type LangiumServices,
  type LangiumSharedServices,
} from "langium/lsp";
import { NodeFileSystem } from "langium/node";
import { createConnection, ProposedFeatures } from "vscode-languageserver/node";

import { createZielLspServices } from "./create-services";
import { registerWorkspaceValidation } from "./register-workspace-validation";
import type { SemanticSnapshotCache } from "./semantic-snapshot";

export type ZielLanguageServer = {
  shared: LangiumSharedServices;
  Ziel: LangiumServices;
  semanticSnapshot: SemanticSnapshotCache;
};

/**
 * Create and start a Ziel language server over the supplied Langium context.
 * The caller owns the transport; this keeps the bootstrap reusable by the CLI
 * entry point and editor-specific server bundles.
 */
export function startZielLanguageServer(context: DefaultSharedModuleContext): ZielLanguageServer {
  const services = createZielLspServices(context);
  registerWorkspaceValidation(services.shared, {
    semanticSnapshot: services.semanticSnapshot,
  });

  // Ziel disables Langium validation, so documents never reach Validated.
  startLanguageServer(services.shared, { CodeActionProvider: DocumentState.Linked });
  return services;
}

/** Start the production language server using the stdio transport selected by the LSP client. */
export function startZielStdioLanguageServer(): ZielLanguageServer {
  const connection = createConnection(ProposedFeatures.all);
  return startZielLanguageServer({ connection, ...NodeFileSystem });
}
