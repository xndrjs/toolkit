/**
 * Ziel language server entry (stdio).
 *
 * Bin: `ziel-language-server`
 */
import { DocumentState } from "langium";
import { startLanguageServer } from "langium/lsp";
import { NodeFileSystem } from "langium/node";
import { createConnection, ProposedFeatures } from "vscode-languageserver/node";

import { createZielLspServices } from "./create-services";
import { registerWorkspaceValidation } from "./register-workspace-validation";

const connection = createConnection(ProposedFeatures.all);
const { shared, semanticSnapshot } = createZielLspServices({ connection, ...NodeFileSystem });
registerWorkspaceValidation(shared, { semanticSnapshot });
// Ziel disables Langium validation, so documents never reach Validated — use Linked.
startLanguageServer(shared, { CodeActionProvider: DocumentState.Linked });
