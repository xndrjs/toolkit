/**
 * Langium LSP services for Ziel (connection + documents).
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

import { ZielGeneratedModule, ZielGeneratedSharedModule } from "../lang/generated/module.js";
import { ZielCompletionProvider } from "./completion";
import { ZielDefinitionProvider } from "./definition";
import { ZielFormatter } from "./formatter";
import { ZielHoverProvider } from "./hover";
import { createSemanticSnapshotCache, type SemanticSnapshotCache } from "./semantic-snapshot";

function createZielIntelliSenseModule(
  semanticSnapshot: SemanticSnapshotCache
): Module<LangiumServices, PartialLangiumServices> {
  return {
    lsp: {
      CompletionProvider: (services) => new ZielCompletionProvider(services, semanticSnapshot),
      DefinitionProvider: (services) => new ZielDefinitionProvider(services, semanticSnapshot),
      HoverProvider: (services) => new ZielHoverProvider(services, semanticSnapshot),
      Formatter: () => new ZielFormatter(),
    },
  };
}

/**
 * Create shared + language LSP services for the Ziel language server.
 *
 * Pass `{ connection, ...NodeFileSystem }` from `langium/node` when running as a server.
 * Langium built-in validation is disabled — diagnostics come from compile APIs.
 * Hover / completion / definition read {@link SemanticSnapshotCache}.
 * Formatting walks the CST via {@link ZielFormatter} (no snapshot).
 */
export function createZielLspServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  Ziel: LangiumServices;
  /** Cache filled by {@link registerWorkspaceValidation}; providers read via `.get()`. */
  semanticSnapshot: SemanticSnapshotCache;
} {
  const semanticSnapshot = createSemanticSnapshotCache();

  const shared = inject(
    createDefaultSharedModule(context),
    ZielGeneratedSharedModule as Module<LangiumSharedServices, object>
  );
  const Ziel = inject(
    createDefaultModule({ shared }),
    ZielGeneratedModule as Module<LangiumServices, object>,
    createZielIntelliSenseModule(semanticSnapshot)
  );
  shared.ServiceRegistry.register(Ziel);

  // Publish diagnostics only via workspace-validate (compile checkProgram / parseAndCheck).
  shared.workspace.DocumentBuilder.updateBuildOptions = { validation: false };
  shared.workspace.WorkspaceManager.initialBuildOptions = { validation: false };

  if (!context.connection) {
    shared.workspace.ConfigurationProvider.initialized({});
  }

  return { shared, Ziel, semanticSnapshot };
}
