# @xndrjs/i18n-react

React bindings for [`@xndrjs/i18n`](../i18n): a shared root, colocated namespace gates, and codegen that emits typed `I18nRoot` / `withI18n` / `I18n` for your project.

- **No Suspense** for translation loads — readiness is explicit via gate / HOC fallbacks.
- **SSR → CSR** hydrate with `state` from `serialize()` so warm namespaces resolve via `peek` without a flash.
- **Apps import generated bindings**; this package’s public surface is mainly what codegen and advanced wiring need.

## Install

```bash
npm install @xndrjs/i18n @xndrjs/i18n-react zod
npm install -D tsx
```

Peers: `@xndrjs/i18n` ^0.8, `react` ≥ 19, `zod`, `tsx` (codegen CLI).

## Codegen

Uses the same `i18n.codegen.json` as core. Run **after** `xndrjs-i18n-codegen`:

```bash
npx xndrjs-i18n-react-codegen --config i18n/i18n.codegen.json
```

Optional `i18n-react.codegen.json` next to the core config can override the bindings output path (`output`). Default: `{codegenPath}/react-bindings.generated.tsx`.

Prefer one script that runs core first, then React:

```json
{
  "scripts": {
    "i18n:codegen": "xndrjs-i18n-codegen --config i18n/i18n.codegen.json",
    "i18n:react-codegen": "xndrjs-i18n-react-codegen --config i18n/i18n.codegen.json",
    "i18n:generate": "pnpm i18n:codegen && pnpm i18n:react-codegen"
  }
}
```

Generated exports typically include:

| Export        | Role                                                           |
| ------------- | -------------------------------------------------------------- |
| `I18nRoot`    | Provider over handle + load coordinator + locale               |
| `withI18n`    | HOC gate — injects `{ t, locale }` when namespaces are ready   |
| `I18n`        | Render-prop gate — same readiness model, shell can mount first |
| `useI18nRoot` | Access the typed handle from under the root                    |

With `loaderStrategy: "fetch"`, generated `I18nRoot` requires `fetchImpl` (same DI as `createI18n({ fetchImpl })`).

## SSR → CSR

On the server, load what the page needs and serialize:

```ts
import { createI18n } from "./generated/instance.generated.js";

const i18n = createI18n();
const { t } = await i18n.load({
  namespaces: ["default", "billing"],
  locale,
});
const state = i18n.serialize();
```

Pass `state` into the client root so hydration reuses loaded namespaces:

```tsx
import { I18nRoot, withI18n } from "./generated/react-bindings.generated";

<I18nRoot locale={locale} state={state}>
  <BillingPanel invoiceCount={3} />
</I18nRoot>;
```

Omit `state` only when you intentionally cold-start on the client (gates show `fallback` until load settles).

## `withI18n` (HOC)

Prefer when you need `t` before the `return` (branching, derived labels, building children):

```tsx
const BillingPanel = withI18n<{ invoiceCount: number }>(
  { namespaces: ["billing"], fallback: <p>Loading…</p> },
  function BillingPanel({ invoiceCount }, { t }) {
    return <p>{t("billing", "invoice_summary", { count: invoiceCount })}</p>;
  }
);
```

Own props stay yours; `t` / `locale` are the second argument. Wrong keys or params fail at compile time.

Hooks inside the render function are supported across `pending` → `ready` (including when `I18nRoot` has no hydrated `state`). The Outer always invokes `render` so hook order stays stable; until namespaces are ready it still returns your `fallback` (with a no-op `t` during that discarded render).

## `<I18n>` (gate)

Prefer when the shell can render and translation is a leaf inside JSX:

```tsx
function BillingPanel({ invoiceCount }: { invoiceCount: number }) {
  return (
    <I18n namespaces={["billing"]} fallback={<p>Loading…</p>}>
      {({ t }) => <p>{t("billing", "invoice_summary", { count: invoiceCount })}</p>}
    </I18n>
  );
}
```

Missing namespaces show your fallback for **that gate only**. If a load fails and you omit `renderError`, the gate **throws** so a React error boundary can handle it; `fallback` is not used for errors.

## Day-to-day loop

**configure → codegen (core then React) → `load` on the server → `serialize` → `I18nRoot` → gate where you need more namespaces.**

## Low-level exports

Apps normally use generated bindings. Advanced / library wiring can import from `@xndrjs/i18n-react` directly:

- `I18nRootProvider` / `useI18nRootContext`
- `createI18nLoadGate` / `useNamespaceLoad`
- `createLoadCoordinator`
- `createScopedT` / `bindNamespaceTranslate`

## Docs

Full guide: [xndrjs i18n — React](https://xndrjs.dev/v0/infrastructure/i18n/react/) (or the docs app in this monorepo).
