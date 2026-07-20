/**
 * Holds the shared i18n root: handle + coordinator + active locale.
 *
 * Generated {@link useI18nRoot} casts the handle to the project's typed factory return.
 */
import { createContext, useContext } from "react";
import type { I18nRootContextValue } from "./types.js";

const I18nRootContext = createContext<I18nRootContextValue | null>(null);

/** Resolves the shared root from an ancestor {@link I18nRootProvider}. */
export function useI18nRootContext(): I18nRootContextValue {
  const value = useContext(I18nRootContext);
  if (value === null) {
    throw new Error("useI18nRoot must be used within I18nRoot / I18nRootProvider");
  }
  return value;
}

/** Internal — provider wiring. */
export { I18nRootContext };
