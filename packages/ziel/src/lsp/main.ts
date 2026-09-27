/**
 * Ziel language server entry (stdio).
 *
 * Bin: `ziel-language-server`
 */
import { startLanguageServer } from "langium/lsp";
import { NodeFileSystem } from "langium/node";
import { createConnection, ProposedFeatures } from "vscode-languageserver/node";

import { createZielLspServices } from "./create-services";
import { registerWorkspaceValidation } from "./register-workspace-validation";

const connection = createConnection(ProposedFeatures.all);
const { shared, semanticSnapshot } = createZielLspServices({ connection, ...NodeFileSystem });
registerWorkspaceValidation(shared, { semanticSnapshot });
startLanguageServer(shared);
