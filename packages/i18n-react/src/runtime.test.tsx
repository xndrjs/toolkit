import { act } from "react";
import { createI18nHandle, IcuTranslationProviderMulti } from "@xndrjs/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createI18nLoadGate, I18nRootProvider, useI18nRootContext } from "./index.js";
import type { I18nLoadArgs } from "./namespace-load-gate.js";

type MultiSchema = {
  default: { greeting: { en: string; it: string } };
};
type MultiParams = { default: { greeting: never } };

function createTestI18n() {
  const engine = new IcuTranslationProviderMulti<MultiSchema, MultiParams>({});
  return createI18nHandle(engine, {
    namespaceLoaders: {
      default: async (locale: string) => ({
        greeting: { [locale]: locale === "it" ? "Ciao" : "Hello" },
      }),
    },
  });
}

/** Mirrors codegen: gate factory wired to `I18nRootProvider`. */
function createDefaultLoadGate() {
  return createI18nLoadGate({
    keepPreviousOnPartitionChange: false,
    useLoadArgs: (): I18nLoadArgs => {
      const root = useI18nRootContext();
      const { handle, coordinator, locale } = root;
      return {
        coordinator,
        engineRef: handle,
        partition: locale,
        locale,
        load: (namespaces) =>
          handle.load({
            namespaces: namespaces as ["default"],
            locale,
          }),
        tryResolveSync: (namespaces) =>
          handle.peek({
            namespaces: namespaces as ["default"],
            locale,
          }),
      };
    },
  });
}

describe("runtime primitives", () => {
  it("per-namespace load via gate then translate", async () => {
    const { I18n } = createDefaultLoadGate();

    await act(async () => {
      render(
        <I18nRootProvider createI18n={createTestI18n} locale="it">
          <I18n namespaces={["default"]} fallback={<span data-testid="fallback">loading</span>}>
            {({ t, locale }) => (
              <span data-testid="greeting">
                {locale}:{t("default", "greeting")}
              </span>
            )}
          </I18n>
        </I18nRootProvider>
      );
    });

    const greeting = await screen.findByTestId("greeting");
    expect(greeting.textContent).toBe("it:Ciao");
    expect(screen.queryByTestId("fallback")).toBeNull();
  });

  it("I18nRootProvider rejects dictionary + state together", () => {
    expect(() =>
      render(
        <I18nRootProvider
          createI18n={createTestI18n}
          locale="en"
          dictionary={{}}
          state={{ dictionary: {} }}
        >
          <span />
        </I18nRootProvider>
      )
    ).toThrow(/pass either `state` or `dictionary`/);
  });
});
