// Automatically generated code. Do not edit manually.
"use client";

import {
  type ForwardedRef,
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
} from "react";
import { createI18nLoadGate, I18nRootProvider, useI18nRootContext } from "@xndrjs/i18n-react";
import type { I18nCreateInput } from "@xndrjs/i18n";
import type {
  I18nScopeMultiForLocale,
  ParamsForNamespaces,
  SchemaForNamespaces,
} from "@xndrjs/i18n";
import { createI18n } from "./instance.generated";
import type { MyProjectParams, MyProjectSchema, MyProjectLocale } from "./i18n-types.generated";

export function useI18nRoot(): ReturnType<typeof createI18n> {
  return useI18nRootContext().handle as ReturnType<typeof createI18n>;
}

type AppNamespace = keyof MyProjectSchema & string;

type ScopedT<Ns extends readonly AppNamespace[]> = Ns extends readonly []
  ? (namespace: never, key: never, ...args: never[]) => string
  : I18nScopeMultiForLocale<
      SchemaForNamespaces<MyProjectSchema, Ns>,
      ParamsForNamespaces<MyProjectSchema, MyProjectParams, Ns>,
      MyProjectLocale,
      MyProjectLocale
    >["t"];

type I18nInjected<Ns extends readonly AppNamespace[]> = {
  t: ScopedT<Ns>;
  locale: MyProjectLocale;
  pendingLocale?: MyProjectLocale;
  error?: unknown;
  retry?: () => void;
};
export type I18nProps<Ns extends readonly AppNamespace[]> = I18nInjected<Ns>;

export type WithI18nFallback<P extends object> = ReactNode | ((props: P) => ReactNode);

const gate = createI18nLoadGate({
  useLoadArgs: () => {
    const root = useI18nRootContext();
    const { handle, coordinator, locale } = root;
    return {
      coordinator,
      engineRef: handle,
      partition: locale,
      locale,
      load: (namespaces: readonly string[]) =>
        handle.load({
          namespaces: namespaces as [AppNamespace, ...AppNamespace[]],
          locale,
        }),
      tryResolveSync: (namespaces: readonly string[]) =>
        handle.peek({
          namespaces: namespaces as [AppNamespace, ...AppNamespace[]],
          locale,
        }),
    };
  },
});

export function withI18n<
  P extends object = object,
  R = never,
  const Ns extends readonly AppNamespace[] = readonly AppNamespace[],
>(
  options: {
    namespaces: Ns;
    fallback?: WithI18nFallback<P>;
    renderError?: (args: { error: unknown; retry: () => void; props: P }) => ReactNode;
  },
  render: (props: P, i18n: I18nProps<Ns>, ref?: ForwardedRef<R>) => ReactNode
): ForwardRefExoticComponent<P & RefAttributes<R>> {
  return gate.withI18n(options, render as never) as ForwardRefExoticComponent<P & RefAttributes<R>>;
}

export function I18n<const Ns extends readonly AppNamespace[]>(props: {
  namespaces: Ns;
  fallback?: ReactNode;
  renderError?: (args: { error: unknown; retry: () => void }) => ReactNode;
  children: (value: I18nProps<Ns>) => ReactNode;
}) {
  return gate.I18n(props as never);
}

export function I18nRoot({
  locale,
  children,
  state,
  dictionary,
}: {
  locale: MyProjectLocale;
  children: ReactNode;
  state?: I18nCreateInput | undefined;
  dictionary?: Record<string, unknown> | undefined;
}) {
  return (
    <I18nRootProvider
      createI18n={createI18n}
      locale={locale}
      {...(state !== undefined ? { state } : {})}
      {...(dictionary !== undefined ? { dictionary } : {})}
    >
      {children}
    </I18nRootProvider>
  );
}
