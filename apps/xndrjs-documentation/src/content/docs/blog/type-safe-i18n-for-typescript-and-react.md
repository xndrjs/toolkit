---
title: "Type-safe i18n for TypeScript and React: the i18n mental model according to xndrjs"
description: Why i18n is hard, how @xndrjs/i18n and @xndrjs/i18n-react approach it, a short developer journey from install to SSR/CSR, CMS refresh without rebuilds, and how the stack compares to common alternatives.
date: 2026-07-19
author: Fabio Fognani
tags:
  - i18n
  - typescript
  - react
  - icu
---

Every product that ships in more than one language eventually discovers the same truth: **i18n is not a dictionary lookup**. It is a system that sits between content, builds, servers, and UI — and it fails in quiet, expensive ways when you treat it as a bag of strings.

This post is about that kind of system. It introduces [`@xndrjs/i18n`](https://github.com/xndrjs/toolkit/tree/main/packages/i18n) and [`@xndrjs/i18n-react`](https://github.com/xndrjs/toolkit/tree/main/packages/i18n-react) as one stack: what problems I care about, how the APIs took shape, what day-to-day use looks like, and where the approach diverges from libraries you already know.

---

## What an i18n library actually has to get right

### Keys are contracts, not freestyle strings

In application code, a typo in a translation key is a bug that TypeScript will not catch if keys are plain strings. The UI renders a fallback, a blank, or the key itself — often only in one locale, only on one screen, only after a release.

A serious i18n layer treats keys (and their parameters) as a **contract**: if the message expects a "count", the call site must provide a number; if the key does not exist, the compiler should refuse. That is the difference between “you hope QA finds it” and “the PR does not merge.”

### Pluralization and grammar are not `if (n === 1)`

Languages do not share the same rules for pluralization, gender, and related grammar. ICU MessageFormat exists because “one invoice / many invoices” is only the English-shaped easy case. A library that pushes that logic into app code will either lie to half your locales or grow a private dialect of helpers. MessageFormat keeps the grammar in the message; the runtime should only format it.

### Delivery is a product decision

Shipping every locale and every feature’s copy in the first JS payload is convenient until the site is large. Then you need splits: by locale, by route, by product area. Lazy loading is not an optimization bolted on later — it is how you keep Time to Interactive (TTI) honest while still supporting twenty languages.

### SSR and CSR must agree

On the server you render a string. On the client you hydrate. If the client does not inherit what the server already loaded, you pay for it twice: another fetch for the same namespaces, a flash of fallbacks, or a loading shell over copy the SSR had already resolved. An i18n stack that ignores SSR/CSR handoff forces every runtime to invent the same glue.

### Editorial change is not the same as engineering change

Changing the wording of a button is not the same as adding a new ICU parameter. One is content. The other is a **contract change** that needs types, review, and a release. Libraries that conflate the two either force a full rebuild for every copy tweak, or allow runtime patches that silently diverge from what TypeScript believes.

Those five pressures — contracts, ICU, delivery, hydration, editorial vs engineering — are the map. Everything below is how I navigate them.

---

## How the APIs took shape

I started from a matrix of modes. On paper it looked powerful: every case was clearly delineated and configurable, and the resulting API was optimized for that use case. In practice it taxed the mental model: too many stories for one library. The need was to **uniform the surface**, simplify how you think about the stack, and tell the most linear story possible.

### Single dictionary vs namespaces.

For a small app it is tempting to keep every string in one flat file. That works until it doesn't: features multiply, ownership splits across teams, and “the dictionary” becomes a dumping ground. Designing a library around an explicit single-dictionary mode feels convenient early and forces a refactor once that mode is no longer enough. It is not future-proof. Namespaces are the shape that survives growth, so I treated them as the only story.

### Eager vs lazy loading.

Small apps can ship every label with the JavaScript bundle. That does not scale: more locales and more features mean you are paying for copy the user never sees. Lazy loading is the scalable answer — but it introduces real questions: which resources are available? which ones must be loaded before this screen can render? The challenge was to support that scalable path without destroying developer and user experience, or making “is this translation ready?” a second career.

### Authoring shape vs delivery shape

It is natural to assume the files you edit are the files the runtime downloads. Authoring may prefer a **canonical** view: one place per namespace where all locales (or all variants) live together, easy to diff and review. Delivery often wants the opposite, in order to scale: **split by locale**, or by **delivery area** (for example EU vs Americas), so each request carries only the slice it needs. Supporting both without teaching two mental models meant one authoring contract and codegen that materializes the delivery shape.

Those axes are why the early matrix existed. Collapsing them into one linear story was the main focus, in order to keep it maintainable and usable.

Here are the decisions that got me to that result.

**Compiler-first.** Dictionaries should live as ordinary files. Simple JSON is enough when labels are short. When you need line breaks — and especially when ICU gets dense (`zero`, `one`, `few`, `other`, nested selects) — editing that in JSON becomes painful. I added YAML as an authoring format specifically for those multiline, complex messages. A codegen step should read ICU from either format and produce exact TypeScript types, loaders, and delivery artifacts — so the contract you author is the contract the call site is allowed to see. If a key or parameter is wrong, that should fail at compile time, not in production.

**One handle, one load method.** The core surface should stay small on purpose — roughly:

```ts
const i18n = createI18n();
const { t } = await i18n.load({ namespaces: ["default", "billing"], locale: "en" });
```

That shape should cover the delivery stories that matter in production. You should be able to ship one artifact per locale so each visitor downloads only their language. Or group locales into geographic areas — for example Europe vs the Americas — and deliver one slice per area when several languages share the same content set. Either way you should still call `load` with namespaces and a locale; custom areas should be configuration, not a second API or a second mental model.

**React should be an adapter, not a second engine.** The React layer should not reimplement formatting. It should wrap the same handle: a project-generated root, coordinated loads that dedupe in flight, and readiness UI colocated with the component that asked for those namespaces. The rest of the tree should keep working.

On a language switch, a **keep-while-switch** policy should be the default. If the same namespaces were already loaded for the previous locale, you should not drop back into a loading state while the new locale resolves. The UI should keep the last ready copy — no flash of empty content, no layout shift from a needless spinner — and only wait when there is truly nothing ready to show yet.

The same rule applies to the **first** client render. A gate should show loading only when those resources are not actually available. In an SSR + CSR app, if the server already loaded the same namespaces, it should be able to pass that state to the client: hydration should reuse it — no second fetch or dynamic import, no spinner for work that already happened on the server.

**Why not Suspense for i18n loads?** Suspense is a coarse API: something somewhere in the tree stopped, and you often cannot tell _why_ or _which_ promise did it. Routing translation loads through that model would not buy elegance — it would invite bugs, fight with data and router Suspense elsewhere, and freeze more UI than you meant. Waiting for translations should stay on explicit, local gates so the outcome is predictable.

**Content without rebuild.** Once a full codegen run has fixed the contract, editorial updates should rewrite authoring files and regenerate only the delivery JSON for the namespaces that changed. With fetch-based delivery, the next page load should see the new copy with no app rebuild. If someone changes ICU arguments, regeneration should fail on purpose: that is a contract change and should need codegen and a release.

That is the mental model I aimed for: **codegen owns the contract; load owns readiness; React gates own waiting UI; regenerate owns editorial refresh.**

And that is what I shipped in `@xndrjs/i18n` and `@xndrjs/i18n-react`.

Lets' see how you can use them.

---

## Developer journey: install to SSR and CSR

### Install and configure

```bash
npm install @xndrjs/i18n @xndrjs/i18n-react zod
npm install -D tsx
```

A small config points at your dictionaries:

```json
{
  "projectName": "App",
  "delivery": "split-by-locale",
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml"
  },
  "codegenPath": "generated"
}
```

Add the `@xndrjs/i18n` and `@xndrjs/i18n-react` codegen steps as `package.json` scripts, and prefer a single script that runs them in order — core first, then React bindings:

```json
{
  "scripts": {
    "i18n:codegen": "xndrjs-i18n-codegen --config i18n/i18n.codegen.json",
    "i18n:react-codegen": "xndrjs-i18n-react-codegen --config i18n/i18n.codegen.json",
    "i18n:generate": "pnpm run i18n:codegen && pnpm run i18n:react-codegen"
  }
}
```

```bash
pnpm run i18n:generate
```

That keeps the two CLIs honest as separate tools while giving you one command for day-to-day use (and for `predev` / `prebuild` if you want codegen before every local run).

You get typed keys/params, loaders, delivery JSON, and generated `createI18n` / `I18nRoot` / `withI18n` tailored to the project — not a hand-parameterized provider tree.

### Server: load what the page needs

In a React Server Component (or any server entry), the story is the same as Node:

```ts
const i18n = createI18n();
const { t } = await i18n.load({
  namespaces: ["default", "billing"],
  locale,
});

t("default", "welcome", { name: "Ada" });
const state = i18n.serialize();
```

`serialize()` is the handoff: pass `state` into the client root so hydration reuses what the server already resolved — no second fetch or dynamic import, no loading state for namespaces that are already warm.

### Client: root + colocated gates

```tsx
<I18nRoot locale={locale} state={state}>
  <BillingPanel invoiceCount={3} />
</I18nRoot>
```

A panel that needs `billing` waits locally — own props stay yours; `t` is injected once the namespace is ready:

```tsx
const BillingPanel = withI18n<{ invoiceCount: number }>(
  { namespaces: ["billing"] },
  function BillingPanel({ invoiceCount }, { t }) {
    return <p>{t("billing", "invoice_summary", { count: invoiceCount })}</p>;
  }
);
```

Same gate as a render-prop component when you prefer JSX in place:

```tsx
function BillingPanel({ invoiceCount }: { invoiceCount: number }) {
  return (
    <I18n namespaces={["billing"]}>
      {({ t }) => <p>{t("billing", "invoice_summary", { count: invoiceCount })}</p>}
    </I18n>
  );
}
```

`withI18n` does not mount your component until the namespaces are ready — better when you need `t` before the `return` (branching, derived labels, building children). `<I18n>` mounts immediately and only delays the children callback, so it fits when the shell can render, and translation is just a leaf inside JSX.

Wrong keys or wrong params fail at compile time. Missing namespaces show your fallback UI for that gate only — not a blank app.

That is the day-to-day loop: **configure → codegen → `load` on the server → `serialize` → `I18nRoot` → gate where you need more namespaces.**

---

## Cherry on top: refresh copy without shipping the site

Editorial teams change labels constantly. Shipping a full release for “Login” → “Sign in” is an absurd cost to pay.

Flow:

1. Update the authoring file (or let a CMS webhook write it).
2. Call `regenerateNamespaces` for the namespaces that changed — same ICU contract as the last full codegen.
3. With `loaderStrategy: "fetch"`, delivery JSON is what clients fetch; the next page load shows the new strings.

```ts
import { regenerateNamespaces } from "@xndrjs/i18n/codegen";

// after writing translations/billing.json (labels only)
regenerateNamespaces({
  configPath: "i18n/i18n.codegen.json",
  namespaces: ["billing"],
});
```

Wire that into a Next.js route handler, a Nest controller, or any backend that already receives CMS webhooks. Debounce if the CMS is chatty. You are rewriting JSON artifacts, not rebuilding the frontend. **Contract changes** (new keys, new ICU args) still go through `runCodegen` and a normal release — that boundary is the feature, not a limitation.

---

## How this compares to the usual suspects

Not a full feature matrix — only the differences that change how you work.

| Concern                         | Typical path in popular stacks                            | `@xndrjs/i18n` + `@xndrjs/i18n-react`                                       |
| ------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Key / param safety              | Often string keys; types optional or generated separately | Codegen makes keys and ICU params exact at the call site                    |
| Message format                  | Mixed: custom plurals, or ICU as an add-on                | ICU MessageFormat is the default dialect                                    |
| Lazy delivery                   | Possible, but easy to ship “all locales” by accident      | Split-by-locale / delivery areas are first-class in codegen                 |
| React waiting model             | Hooks + Suspense, or global loading                       | Explicit gates/HOC; Suspense deliberately unused for i18n loads             |
| Editorial update without deploy | Runtime merge/patch, or full rebuild / CDN folklore       | `regenerateNamespaces` + fetch loaders; contract changes still need release |
| SSR → CSR                       | DIY serialize/hydrate                                     | `serialize()` + `I18nRoot state` is the supported path                      |

Libraries like **i18next**, **react-intl / FormatJS**, **next-intl**, and **Paraglide** are mature and capable. Many teams are happy with them. The bet here is narrower: **compiler-owned contracts**, **explicit delivery**, **predictable React readiness**, and a **clean editorial path** that does not pretend copy tweaks are the same as API changes.

If those are the pressures you feel, the stack is meant to feel small once the mental model clicks.

---

## Where to go next

- Package docs: [`@xndrjs/i18n`](/v0/infrastructure/i18n/) in this site’s documentation line
- Source: [toolkit packages](https://github.com/xndrjs/toolkit/tree/main/packages)
- Hands-on: the [`i18n-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/i18n-demo) app shows multi, areas (fetch), and programmatic config side by side
