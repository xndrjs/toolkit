---
title: React
description: I18nRoot, withI18n, and the I18n gate from @xndrjs/i18n-react.
---

`@xndrjs/i18n-react` adds client bindings on top of `@xndrjs/i18n`: a shared root, colocated namespace gates, and codegen that emits typed `I18nRoot` / `withI18n` / `I18n` for your project. There is **no Suspense** for translation loads — readiness is explicit via gate / HOC fallbacks.

## Install

```bash
pnpm add @xndrjs/i18n @xndrjs/i18n-react zod
pnpm add -D tsx
```

Peers: `@xndrjs/i18n` ^0.8, `react` ≥ 19, `zod`, `tsx` (codegen CLI).

## Codegen

Uses the same `i18n.codegen.json` as core. Run **after** `xndrjs-i18n-codegen`:

```bash
xndrjs-i18n-react-codegen --config i18n/i18n.codegen.json
```

Optional `i18n-react.codegen.json` next to the core config can override the bindings output path (`output`). Default: `{codegenPath}/react-bindings.generated.tsx`.

Prefer one script that runs core first, then React — see [Overview — Codegen script](/v0/infrastructure/i18n/#codegen-script).

Generated exports typically include:

- `I18nRoot` — provider over handle + load coordinator + locale
- `withI18n` — HOC gate
- `I18n` — render-prop gate
- `useI18nRoot` — access the handle from under the root

With `loaderStrategy: "fetch"`, generated `I18nRoot` requires `fetchImpl` (same DI as `createI18n({ fetchImpl })`).

## SSR → CSR

On the server, load what the page needs and serialize:

```ts
const i18n = createI18n();
const { t } = await i18n.load({
  namespaces: ["default", "billing"],
  locale,
});
const state = i18n.serialize();
```

Pass `state` into the client root so hydration reuses loaded namespaces (`peek`) without a second fetch or a loading flash for warm resources:

```tsx
<I18nRoot locale={locale} state={state}>
  <BillingPanel invoiceCount={3} />
</I18nRoot>
```

## `withI18n` (HOC)

Does **not** mount your component until the requested namespaces are ready. Prefer this when you need `t` before the `return` (branching, derived labels, building children).

```tsx
const BillingPanel = withI18n<{ invoiceCount: number }>(
  { namespaces: ["billing"], fallback: <p>Loading…</p> },
  function BillingPanel({ invoiceCount }, { t }) {
    return <p>{t("billing", "invoice_summary", { count: invoiceCount })}</p>;
  }
);
```

Own props stay yours; `t` / `locale` are injected as the second argument once ready. Wrong keys or params fail at compile time.

## `<I18n>` (gate)

Mounts immediately and only delays the children callback. Prefer this when the shell can render and translation is a leaf inside JSX.

```tsx
function BillingPanel({ invoiceCount }: { invoiceCount: number }) {
  return (
    <I18n namespaces={["billing"]} fallback={<p>Loading…</p>}>
      {({ t }) => <p>{t("billing", "invoice_summary", { count: invoiceCount })}</p>}
    </I18n>
  );
}
```

Missing namespaces show your fallback UI for **that gate only** — not a blank app.

## Day-to-day loop

**configure → codegen (core then React) → `load` on the server → `serialize` → `I18nRoot` → gate where you need more namespaces.**

See also [Runtime](/v0/infrastructure/i18n/runtime/), [Lazy loading](/v0/infrastructure/i18n/lazy-loading/), and the [blog post](/blog/type-safe-i18n-for-typescript-and-react/).
