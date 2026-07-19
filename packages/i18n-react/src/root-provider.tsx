/**
 * Single provider that shares handle + coordinator + locale across a lazy subtree.
 */
import { useRef, type ReactNode } from "react";
import type { FetchArtifact, I18nCreateInput, OnMissingTranslation } from "@xndrjs/i18n";
import { createLoadCoordinator } from "./create-load-coordinator.js";
import { I18nRootContext } from "./root-context.js";
import type {
  CreateI18nFactory,
  I18nHandleLike,
  I18nRootContextValue,
  ScopedScopeLike,
} from "./types.js";

export interface I18nRootProviderProps {
  createI18n: CreateI18nFactory;
  locale: string;
  /**
   * Cold-start / eager dictionary seed (defaults to `{}` when neither prop is set).
   * Mutually exclusive with {@link state}.
   */
  dictionary?: Record<string, unknown>;
  /** Full create/hydrate input from `handle.serialize()` — mutually exclusive with {@link dictionary}. */
  state?: I18nCreateInput | undefined;
  onMissing?: OnMissingTranslation;
  /** Custom JSON loader for `loaderStrategy: "fetch"` projects (ignored by import loaders). */
  fetchImpl?: FetchArtifact;
  children: ReactNode;
}

/** Creates and shares one handle + load coordinator for descendant gates. */
export function I18nRootProvider({
  createI18n,
  locale,
  dictionary,
  state,
  onMissing,
  fetchImpl,
  children,
}: I18nRootProviderProps): ReactNode {
  if (state !== undefined && dictionary !== undefined) {
    throw new Error("I18nRootProvider: pass either `state` or `dictionary`, not both.");
  }

  const valueRef = useRef<I18nRootContextValue | null>(null);

  if (valueRef.current === null) {
    const seed: I18nCreateInput =
      state ?? ({ dictionary: dictionary ?? {} } satisfies I18nCreateInput);
    const handle = createI18n({
      state: seed,
      ...(onMissing !== undefined ? { onMissing } : {}),
      ...(fetchImpl !== undefined ? { fetchImpl } : {}),
    });
    valueRef.current = {
      handle: handle as I18nHandleLike,
      coordinator: createLoadCoordinator<ScopedScopeLike>(),
      locale,
    };
  } else {
    valueRef.current.locale = locale;
  }

  return <I18nRootContext.Provider value={valueRef.current}>{children}</I18nRootContext.Provider>;
}
