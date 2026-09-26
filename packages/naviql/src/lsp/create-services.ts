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
  type PartialLangiumServices,
} from "langium/lsp";

import { NaviQlGeneratedModule, NaviQlGeneratedSharedModule } from "../lang/generated/module.js";
import { NaviQlHoverProvider } from "./hover";
import { createSemanticSnapshotCache, type SemanticSnapshotCache } from "./semantic-snapshot";

function createNaviQlIntelliSenseModule(
  semanticSnapshot: SemanticSnapshotCache
): Module<LangiumServices, PartialLangiumServices> {
  return {
    lsp: {
      HoverProvider: (services) => new NaviQlHoverProvider(services, semanticSnapshot),
    },
  };
}

/**
 * Create shared + language LSP services for the NaviQL language server.
 *
 * Pass `{ connection, ...NodeFileSystem }` from `langium/node` when running as a server.
 * Langium built-in validation is disabled — diagnostics come from compile APIs.
 * Hover (and later completion / definition) read {@link SemanticSnapshotCache}.
 */
export function createNaviQlLspServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  NaviQl: LangiumServices;
  /** Cache filled by {@link registerWorkspaceValidation}; providers read via `.get()`. */
  semanticSnapshot: SemanticSnapshotCache;
} {
  const semanticSnapshot = createSemanticSnapshotCache();

  const shared = inject(
    createDefaultSharedModule(context),
    NaviQlGeneratedSharedModule as Module<LangiumSharedServices, object>
  );
  const NaviQl = inject(
    createDefaultModule({ shared }),
    NaviQlGeneratedModule as Module<LangiumServices, object>,
    createNaviQlIntelliSenseModule(semanticSnapshot)
  );
  shared.ServiceRegistry.register(NaviQl);

  // Publish diagnostics only via workspace-validate (compile checkProgram / parseAndCheck).
  shared.workspace.DocumentBuilder.updateBuildOptions = { validation: false };
  shared.workspace.WorkspaceManager.initialBuildOptions = { validation: false };

  if (!context.connection) {
    shared.workspace.ConfigurationProvider.initialized({});
  }

  return { shared, NaviQl, semanticSnapshot };
}
