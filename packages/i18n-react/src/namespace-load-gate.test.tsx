import { act, useState } from "react";
import { createI18nHandle, IcuTranslationProviderMulti } from "@xndrjs/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createLoadCoordinator } from "./create-load-coordinator.js";
import { createI18nLoadGate, useNamespaceLoad, type I18nLoadArgs } from "./namespace-load-gate.js";
import type { ScopedScopeLike } from "./types.js";

type MultiSchema = {
  default: { greeting: { en: string; it: string } };
  billing: { invoice: { en: string; it: string } };
};
type MultiParams = {
  default: { greeting: never };
  billing: { invoice: never };
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createTestHandle() {
  const engine = new IcuTranslationProviderMulti<MultiSchema, MultiParams>({});
  return createI18nHandle(engine, {
    namespaceLoaders: {
      default: async (locale: string) => ({
        greeting: { [locale]: locale === "it" ? "Ciao" : "Hello" },
      }),
      billing: async (locale: string) => ({
        invoice: { [locale]: locale === "it" ? "Fattura" : "Invoice" },
      }),
    },
  });
}

function createGateFixture(options?: {
  load?: (namespaces: readonly string[]) => Promise<ScopedScopeLike>;
  locale?: string;
  keepPreviousOnPartitionChange?: boolean;
}) {
  const handle = createTestHandle();
  const coordinator = createLoadCoordinator<ScopedScopeLike>();
  const locale = options?.locale ?? "it";
  const load =
    options?.load ??
    ((namespaces: readonly string[]) =>
      handle.load({ namespaces: [...namespaces] as ["default"], locale: locale }));

  const { I18n, withI18n } = createI18nLoadGate({
    ...(options?.keepPreviousOnPartitionChange !== undefined
      ? { keepPreviousOnPartitionChange: options.keepPreviousOnPartitionChange }
      : { keepPreviousOnPartitionChange: false }),
    useLoadArgs: (): I18nLoadArgs => ({
      coordinator,
      engineRef: handle,
      partition: locale,
      locale,
      load,
    }),
  });

  return { I18n, withI18n, coordinator, handle, locale };
}

describe("useNamespaceLoad", () => {
  it("re-renders when the coordinator entry resolves", async () => {
    const pending = deferred<ScopedScopeLike>();
    const handle = createTestHandle();
    const coordinator = createLoadCoordinator<ScopedScopeLike>();

    function Probe() {
      const entry = useNamespaceLoad({
        coordinator,
        engineRef: handle,
        partition: "it",
        namespaces: ["default"],
        locale: "it",
        load: () => pending.promise,
      });
      return <span data-testid="status">{entry.status}</span>;
    }

    render(<Probe />);
    expect(screen.getByTestId("status").textContent).toBe("pending");

    const scope = await handle.load({ namespaces: ["default"], locale: "it" });
    await act(async () => {
      pending.resolve(scope);
      await pending.promise;
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
  });
});

describe("createI18nLoadGate", () => {
  it("preserves parent useState while the gate is pending", async () => {
    const pending = deferred<ScopedScopeLike>();
    const { I18n } = createGateFixture({ load: () => pending.promise });

    function Parent() {
      const [count, setCount] = useState(0);
      return (
        <div>
          <button type="button" data-testid="inc" onClick={() => setCount((c) => c + 1)}>
            inc
          </button>
          <span data-testid="count">{count}</span>
          <I18n namespaces={["default"]} fallback={<span data-testid="fallback">loading</span>}>
            {({ t }) => <span data-testid="greeting">{t("default", "greeting")}</span>}
          </I18n>
        </div>
      );
    }

    render(<Parent />);
    expect(screen.getByTestId("fallback").textContent).toBe("loading");
    expect(screen.getByTestId("count").textContent).toBe("0");

    await act(async () => {
      screen.getByTestId("inc").click();
    });
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("fallback").textContent).toBe("loading");

    const handle = createTestHandle();
    const scope = await handle.load({ namespaces: ["default"], locale: "it" });
    await act(async () => {
      pending.resolve(scope);
      await pending.promise;
    });

    expect(screen.getByTestId("greeting").textContent).toBe("Ciao");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("loads multiple namespaces and injects one scoped multi t", async () => {
    const pending = deferred<ScopedScopeLike>();
    const { I18n } = createGateFixture({ load: () => pending.promise });

    render(
      <I18n namespaces={["default", "billing"]} fallback={<span data-testid="fallback">wait</span>}>
        {({ t, locale }) => (
          <span data-testid="copy">
            {locale}:{t("default", "greeting")}/{t("billing", "invoice")}
          </span>
        )}
      </I18n>
    );

    expect(screen.getByTestId("fallback").textContent).toBe("wait");

    const handle = createTestHandle();
    const scope = await handle.load({ namespaces: ["default", "billing"], locale: "it" });
    await act(async () => {
      pending.resolve(scope);
      await pending.promise;
    });

    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(screen.getByTestId("copy").textContent).toBe("it:Ciao/Fattura");
  });

  it("defaults fallback to null while pending", () => {
    const pending = deferred<ScopedScopeLike>();
    const { I18n } = createGateFixture({ load: () => pending.promise });

    const { container } = render(
      <I18n namespaces={["default"]}>
        {({ t }) => <span data-testid="greeting">{t("default", "greeting")}</span>}
      </I18n>
    );

    expect(screen.queryByTestId("greeting")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders fallback on load error (no remount storm)", async () => {
    const pending = deferred<ScopedScopeLike>();
    const { I18n, coordinator, handle, locale } = createGateFixture({
      load: () => pending.promise,
    });

    render(
      <I18n namespaces={["default"]} fallback={<span data-testid="fallback">err-or-pending</span>}>
        {({ t }) => <span data-testid="greeting">{t("default", "greeting")}</span>}
      </I18n>
    );

    await act(async () => {
      pending.reject(new Error("load failed"));
      await pending.promise.catch(() => undefined);
    });

    expect(screen.getByTestId("fallback").textContent).toBe("err-or-pending");
    expect(screen.queryByTestId("greeting")).toBeNull();
    expect(
      coordinator.getEntry({
        engineRef: handle,
        partition: locale,
        namespaces: ["default"],
      })
    ).toEqual({ status: "error", error: expect.any(Error) });
  });

  it("renderError exposes retry for failed loads", async () => {
    let attempts = 0;
    const handle = createTestHandle();
    const coordinator = createLoadCoordinator<ScopedScopeLike>();
    let currentPromise = deferred<ScopedScopeLike>();

    const { I18n } = createI18nLoadGate({
      keepPreviousOnPartitionChange: false,
      useLoadArgs: (): I18nLoadArgs => ({
        coordinator,
        engineRef: handle,
        partition: "it",
        locale: "it",
        load: () => {
          attempts += 1;
          return currentPromise.promise;
        },
      }),
    });

    render(
      <I18n
        namespaces={["default"]}
        fallback={<span data-testid="fallback">loading</span>}
        renderError={({ retry }) => (
          <button type="button" data-testid="retry" onClick={retry}>
            retry
          </button>
        )}
      >
        {({ t }) => <span data-testid="greeting">{t("default", "greeting")}</span>}
      </I18n>
    );

    await act(async () => {
      currentPromise.reject(new Error("boom"));
      await currentPromise.promise.catch(() => undefined);
    });

    expect(screen.getByTestId("retry")).toBeTruthy();
    expect(attempts).toBe(1);

    currentPromise = deferred<ScopedScopeLike>();
    await act(async () => {
      screen.getByTestId("retry").click();
    });

    const scope = await handle.load({ namespaces: ["default"], locale: "it" });
    await act(async () => {
      currentPromise.resolve(scope);
      await currentPromise.promise;
    });

    expect(attempts).toBe(2);
    expect(screen.getByTestId("greeting").textContent).toBe("Ciao");
  });

  it("HOC Outer injects t when resolved and keeps parent state while pending", async () => {
    const pending = deferred<ScopedScopeLike>();
    const { withI18n } = createGateFixture({ load: () => pending.promise });

    const Child = withI18n<{ label: string }>(
      {
        namespaces: ["default"],
        fallback: <span data-testid="fallback">loading</span>,
      },
      function Child({ label }, { t }) {
        return (
          <span data-testid="child">
            {label}:{t("default", "greeting")}
          </span>
        );
      }
    );

    function Parent() {
      const [n, setN] = useState(0);
      return (
        <div>
          <button type="button" data-testid="bump" onClick={() => setN((x) => x + 1)}>
            bump
          </button>
          <span data-testid="n">{n}</span>
          <Child label="x" />
        </div>
      );
    }

    render(<Parent />);
    expect(screen.getByTestId("fallback").textContent).toBe("loading");

    await act(async () => {
      screen.getByTestId("bump").click();
    });
    expect(screen.getByTestId("n").textContent).toBe("1");

    const handle = createTestHandle();
    const scope = await handle.load({ namespaces: ["default"], locale: "it" });
    await act(async () => {
      pending.resolve(scope);
      await pending.promise;
    });

    expect(screen.getByTestId("child").textContent).toBe("x:Ciao");
    expect(screen.getByTestId("n").textContent).toBe("1");
  });

  it("HOC forwards ref to the inner render when resolved", async () => {
    const { withI18n } = createGateFixture();
    const ref = { current: null as HTMLSpanElement | null };

    const Child = withI18n<{ label: string }, HTMLSpanElement>(
      { namespaces: ["default"] },
      function Child({ label }, { t }, forwarded) {
        return (
          <span ref={forwarded} data-testid="child">
            {label}:{t("default", "greeting")}
          </span>
        );
      }
    );

    await act(async () => {
      render(<Child label="ref" ref={ref} />);
    });

    expect(await screen.findByTestId("child")).toBeTruthy();
    expect(ref.current?.tagName).toBe("SPAN");
    expect(ref.current?.textContent).toBe("ref:Ciao");
  });

  it("HOC fallback can read own props", async () => {
    const pending = deferred<ScopedScopeLike>();
    const { withI18n } = createGateFixture({ load: () => pending.promise });

    const Child = withI18n<{ label: string }>(
      {
        namespaces: ["default"],
        fallback: ({ label }) => <span data-testid="fallback">loading:{label}</span>,
      },
      function Child({ label }, { t }) {
        return (
          <span data-testid="child">
            {label}:{t("default", "greeting")}
          </span>
        );
      }
    );

    render(<Child label="x" />);
    expect(screen.getByTestId("fallback").textContent).toBe("loading:x");

    const handle = createTestHandle();
    const scope = await handle.load({ namespaces: ["default"], locale: "it" });
    await act(async () => {
      pending.resolve(scope);
      await pending.promise;
    });

    expect(screen.getByTestId("child").textContent).toBe("x:Ciao");
  });

  it("dedupes loads across two gates sharing one coordinator", async () => {
    const handle = createTestHandle();
    const coordinator = createLoadCoordinator<ScopedScopeLike>();
    let loadCount = 0;
    const pending = deferred<ScopedScopeLike>();

    const useLoadArgs = (): I18nLoadArgs => ({
      coordinator,
      engineRef: handle,
      partition: "en",
      locale: "en",
      load: () => {
        loadCount += 1;
        return pending.promise;
      },
    });

    const { I18n } = createI18nLoadGate({
      keepPreviousOnPartitionChange: false,
      useLoadArgs,
    });

    function Twin() {
      return (
        <>
          <I18n namespaces={["default"]} fallback={<span data-testid="a">a</span>}>
            {({ t }) => <span data-testid="ga">{t("default", "greeting")}</span>}
          </I18n>
          <I18n namespaces={["default"]} fallback={<span data-testid="b">b</span>}>
            {({ t }) => <span data-testid="gb">{t("default", "greeting")}</span>}
          </I18n>
        </>
      );
    }

    render(<Twin />);
    expect(loadCount).toBe(1);

    const scope = await handle.load({ namespaces: ["default"], locale: "en" });
    await act(async () => {
      pending.resolve(scope);
      await pending.promise;
    });

    expect(screen.getByTestId("ga").textContent).toBe("Hello");
    expect(screen.getByTestId("gb").textContent).toBe("Hello");
  });
});

describe("createI18nLoadGate ready path", () => {
  it("renders immediately when the coordinator entry is already resolved", async () => {
    const handle = createTestHandle();
    const coordinator = createLoadCoordinator<ScopedScopeLike>();
    const locale = "it";
    const scope = await handle.load({ namespaces: ["default"], locale: locale });

    coordinator.request({
      engineRef: handle,
      partition: locale,
      namespaces: ["default"],
      load: async () => scope,
    });
    await coordinator.getPromise();

    const { I18n } = createI18nLoadGate({
      keepPreviousOnPartitionChange: false,
      useLoadArgs: (): I18nLoadArgs => ({
        coordinator,
        engineRef: handle,
        partition: locale,
        locale,
        load: async () => scope,
      }),
    });

    render(
      <I18n namespaces={["default"]} fallback={<span data-testid="fallback">nope</span>}>
        {({ t }) => <span data-testid="greeting">{t("default", "greeting")}</span>}
      </I18n>
    );

    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(screen.getByTestId("greeting").textContent).toBe("Ciao");
  });
});

describe("createI18nLoadGate keep-then-switch", () => {
  it("keeps previous t across locale change until new partition resolves", async () => {
    const handle = createTestHandle();
    const coordinator = createLoadCoordinator<ScopedScopeLike>();
    let activeLocale = "en";
    const pendingIt = deferred<ScopedScopeLike>();

    const { I18n } = createI18nLoadGate({
      keepPreviousOnPartitionChange: true,
      useLoadArgs: (): I18nLoadArgs => ({
        coordinator,
        engineRef: handle,
        partition: activeLocale,
        locale: activeLocale,
        load: (namespaces) => {
          if (activeLocale === "it") {
            return pendingIt.promise;
          }
          return handle.load({ namespaces: [...namespaces] as ["default"], locale: activeLocale });
        },
      }),
    });

    function App({ locale }: { locale: string }) {
      activeLocale = locale;
      return (
        <I18n namespaces={["default"]} fallback={<span data-testid="fallback">loading</span>}>
          {({ t, locale: displayLocale, pendingLocale }) => (
            <span data-testid="row">
              {displayLocale}:{t("default", "greeting")}:{pendingLocale ?? "-"}
            </span>
          )}
        </I18n>
      );
    }

    const { rerender } = render(<App locale="en" />);
    expect((await screen.findByTestId("row")).textContent).toBe("en:Hello:-");

    rerender(<App locale="it" />);
    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(screen.getByTestId("row").textContent).toBe("en:Hello:it");

    const itScope = await handle.load({ namespaces: ["default"], locale: "it" });
    await act(async () => {
      pendingIt.resolve(itScope);
      await pendingIt.promise;
    });

    expect(screen.getByTestId("row").textContent).toBe("it:Ciao:-");
  });

  it("first mount without snapshot still uses fallback", () => {
    const pending = deferred<ScopedScopeLike>();
    const { I18n } = createGateFixture({
      load: () => pending.promise,
      keepPreviousOnPartitionChange: true,
    });

    render(
      <I18n namespaces={["default"]} fallback={<span data-testid="fallback">wait</span>}>
        {({ t }) => <span data-testid="greeting">{t("default", "greeting")}</span>}
      </I18n>
    );

    expect(screen.getByTestId("fallback").textContent).toBe("wait");
    expect(screen.queryByTestId("greeting")).toBeNull();
  });
});
