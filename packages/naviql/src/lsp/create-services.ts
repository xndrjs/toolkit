/**
 * Langium LSP services for NaviQL (connection + documents).
 * Semantic checking is done separately via {@link registerWorkspaceValidation}.
 */
import { inject, type Module } from "langium";
import {
  createDefaultModule,
  createDefaultSharedModule,
  type DefaultSharedModuleContext,
  type LangiumServices,
  type LangiumSharedServices,
} from "langium/lsp";

import { NaviQlGeneratedModule, NaviQlGeneratedSharedModule } from "../lang/generated/module.js";

/**
 * Create shared + language LSP services for the NaviQL language server.
 *
 * Pass `{ connection, ...NodeFileSystem }` from `langium/node` when running as a server.
 * Langium built-in validation is disabled — diagnostics come from compile APIs.
 */
export function createNaviQlLspServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  NaviQl: LangiumServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    NaviQlGeneratedSharedModule as Module<LangiumSharedServices, object>
  );
  const NaviQl = inject(
    createDefaultModule({ shared }),
    NaviQlGeneratedModule as Module<LangiumServices, object>
  );
  shared.ServiceRegistry.register(NaviQl);

  // Publish diagnostics only via workspace-validate (compile checkProgram / parseAndCheck).
  shared.workspace.DocumentBuilder.updateBuildOptions = { validation: false };
  shared.workspace.WorkspaceManager.initialBuildOptions = { validation: false };

  if (!context.connection) {
    shared.workspace.ConfigurationProvider.initialized({});
  }

  return { shared, NaviQl };
}
