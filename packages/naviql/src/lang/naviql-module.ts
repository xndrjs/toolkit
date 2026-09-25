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
import { NaviQlGeneratedModule, NaviQlGeneratedSharedModule } from "./generated/module.js";

/**
 * Langium core services for NaviQL. Used only from `@xndrjs/naviql/compile`.
 * Core (not LSP) — compile-time parse/check, no language server.
 */
export type NaviQlServices = LangiumCoreServices;

/**
 * Extension point for custom DI overrides (validators, etc. later).
 */
export const NaviQlModule: Module<NaviQlServices, object> = {};

/**
 * Create shared + language core services for parsing `.naviql` sources.
 *
 * Defaults to {@link EmptyFileSystem}. Pass `{ ...NodeFileSystem }` from
 * `langium/node` when reading real files.
 */
export function createNaviQlServices(context: DefaultSharedCoreModuleContext = EmptyFileSystem): {
  shared: LangiumSharedCoreServices;
  NaviQl: NaviQlServices;
} {
  const shared = inject(createDefaultSharedCoreModule(context), NaviQlGeneratedSharedModule);
  const NaviQl = inject(createDefaultCoreModule({ shared }), NaviQlGeneratedModule, NaviQlModule);
  shared.ServiceRegistry.register(NaviQl);
  shared.workspace.ConfigurationProvider.initialized({});
  return { shared, NaviQl };
}
