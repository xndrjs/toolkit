/**
 * NaviQL language server entry (stdio).
 *
 * Bin: `naviql-language-server`
 */
import { startLanguageServer } from "langium/lsp";
import { NodeFileSystem } from "langium/node";
import { createConnection, ProposedFeatures } from "vscode-languageserver/node";

import { createNaviQlLspServices } from "./create-services";
import { registerWorkspaceValidation } from "./register-workspace-validation";

const connection = createConnection(ProposedFeatures.all);
const { shared } = createNaviQlLspServices({ connection, ...NodeFileSystem });
registerWorkspaceValidation(shared);
startLanguageServer(shared);
