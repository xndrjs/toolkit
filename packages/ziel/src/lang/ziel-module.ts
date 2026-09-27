import {
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
  inject,
  type DefaultSharedCoreModuleContext,
  type LangiumCoreServices,
  type LangiumSharedCoreServices,
  type Module,
} from "langium";
import { ZielGeneratedModule, ZielGeneratedSharedModule } from "./generated/module.js";

/**
 * Langium core services for Ziel. Used only from `@xndrjs/ziel/compile`.
 * Core (not LSP) — compile-time parse/check, no language server.
 */
export type ZielServices = LangiumCoreServices;

/**
 * Extension point for custom DI overrides (validators, etc. later).
 */
export const ZielModule: Module<ZielServices, object> = {};

/**
 * Create shared + language core services for parsing `.ziel` sources.
 *
 * Defaults to {@link EmptyFileSystem}. Pass `{ ...NodeFileSystem }` from
 * `langium/node` when reading real files.
 */
export function createZielServices(context: DefaultSharedCoreModuleContext = EmptyFileSystem): {
  shared: LangiumSharedCoreServices;
  Ziel: ZielServices;
} {
  const shared = inject(createDefaultSharedCoreModule(context), ZielGeneratedSharedModule);
  const Ziel = inject(createDefaultCoreModule({ shared }), ZielGeneratedModule, ZielModule);
  shared.ServiceRegistry.register(Ziel);
  shared.workspace.ConfigurationProvider.initialized({});
  return { shared, Ziel };
}
