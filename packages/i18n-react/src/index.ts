/**
 * Public entry point for `@xndrjs/i18n-react`.
 *
 * Only symbols imported by `react-bindings.generated.tsx` (and tests) are exported.
 */
export { bindNamespaceTranslate, createScopedT } from "./create-scoped-t.js";
export { createLoadCoordinator } from "./create-load-coordinator.js";
export {
  createI18nLoadGate,
  useNamespaceLoad,
  type WithI18nRender,
  type WithI18nFallback,
  type I18nLoadGateValue,
  type I18nGateProps,
  type I18nHocOptions,
} from "./namespace-load-gate.js";
export { useI18nRootContext } from "./root-context.js";
export { I18nRootProvider, type I18nRootProviderProps } from "./root-provider.js";
