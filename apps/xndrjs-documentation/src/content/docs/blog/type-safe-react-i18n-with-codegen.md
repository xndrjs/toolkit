---
title: "Easy and flexible React i18n with @xndrjs/i18n-react"
description: Bring lazy, locale-aware i18n into React without giving up type safety or freezing your whole app while translations load.
date: 2026-07-17
author: Fabio Fognani
tags:
  - i18n
  - react
  - typescript
  - nextjs
---

In [Type-safe i18n and flexible delivery](/blog/type-safe-i18n-with-flexible-delivery/) I closed by saying there were no React wrappers yet — on purpose. The core had to be stable before adding adapters. That layer is now [`@xndrjs/i18n-react`](https://github.com/xndrjs/toolkit/tree/main/packages/i18n-react). It does not replace `@xndrjs/i18n`; it builds on it.

For most small-to-medium apps — few locales, one or a handful of namespaces — an **eager** single- or multi-namespace setup is enough. Wiring a React provider around a vanilla `createI18n` scope is trivial, as in the previous article: put the loaded instance in context and call `t` from components.

Things get interesting when delivery is **lazy**: dictionaries split by locale or by custom delivery area. Then you want async chunks without duplicate network requests, and you want **ancestor React state to survive** while those chunks load.

Locale changes make that sharper. Updating the root `locale` must start loads for missing namespace/locale resources. Until those settle, the new locale is not ready — the tree must not crash or flash empty labels.

Through all of this you still want **type safety**: one translate function typed on the namespaces you request, bound to the **current** locale.

`@xndrjs/i18n-react` addresses those constraints with a thin runtime plus a **second codegen step**. One shared engine for the client tree, loads that dedupe when the same namespaces are already in flight, and waiting UI colocated with the component that needs those translations — so the rest of the tree can keep working while chunks load.

Codegen emits typed React bindings: you declare which namespaces a component needs, and when they are ready you get a scoped translate function for exactly that set.

---

## Two delivery modes on the client

The React codegen step reads the same `i18n.codegen.json` you already use for core i18n and emits typed bindings your client components import from one place.

What those bindings look like depends on how you ship dictionaries.

**Eager** — dictionaries are available up front (typical for a small locale set or a single bundled catalog). The client wraps the tree once with the active locale; translations are ready immediately. You still declare which namespaces a piece of UI needs, so `t` stays typed to that subset — but there is nothing asynchronous to wait for.

**Lazy** — namespaces (and often locales) arrive as separate chunks. The client still has one shared engine and an active locale, but each screen or widget asks only for the namespaces it needs. While those chunks load, that widget shows its own waiting UI; everything above it keeps running. You can optionally seed the client with resources the server already loaded, so the first paint does not flash a spinner for work that already happened.

In both modes you get the same idea: declare the namespaces you need, get a scoped translate function (and the current locale) when they are ready. With a single-namespace profile, `t` takes a key; with multi, `t` takes namespace then key — always limited to what you asked for. During a locale switch, the previous strings can stay on screen until the new ones are ready, so the UI does not go blank mid-transition.

---

## What core @xndrjs/i18n already gives you

`@xndrjs/i18n` runs anywhere TypeScript runs:

- **Server** (RSC, route handlers): `createI18n` + `load()` — no provider.
- **Lazy loading**: per namespace and locale/area, with engine-level dedupe.
- **Hydration**: after loading resources, `serialize()` produces a serialized state you pass into the client root so the first paint can skip pending for resources already loaded (see the lazy + hydrate example below).

```tsx
// app/[locale]/page.tsx — Server Component
import { createI18n } from "@/i18n";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function Page({ params }: PageProps) {
  const { locale } = await params;

  const { t } = await createI18n().load({
    namespaces: ["default", "user", "billing"],
    locale,
  });

  return <p>{t("default", "welcome", { name: "Server" })}</p>;
}
```

React adds constraints vanilla code does not have:

<table>
  <colgroup>
    <col style="width: 32%" />
    <col style="width: 68%" />
  </colgroup>
  <thead>
    <tr>
      <th>Concern</th>
      <th>Why it matters</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Shared instance</strong></td>
      <td>One engine for the whole client subtree</td>
    </tr>
    <tr>
      <td><strong>Async loading</strong></td>
      <td><code>load()</code> is a Promise — gate until ready without nuking ancestor state</td>
    </tr>
    <tr>
      <td><strong>Multi-namespace</strong></td>
      <td>Wait for the requested namespace resources, then expose one scoped <code>t</code> bound on those namespaces</td>
    </tr>
    <tr>
      <td><strong>Dedicated status</strong></td>
      <td>i18n must not join React’s Suspense channel</td>
    </tr>
  </tbody>
</table>

---

## Design choice: codegen over parametric generics

A hypothetical `<I18nProvider<MySchema, MyParams, MyLocale>>` looks clean in a design doc. In practice you get nested generics and branches for single/multi, eager/lazy, split/custom — and consumers still fight the types.

So the stack stays **compiler-first**. You already run codegen for `@xndrjs/i18n`: one config file produces your schema types, factory, and loaders. `@xndrjs/i18n-react` adds a second pass over that same config. It emits React bindings tailored to your project — roots, `withI18n`, `I18n` — while a small shared runtime does the loading and waiting. Your app imports those generated bindings, not a hand-parameterized provider tree.

---

## HOC and Gate component

`withI18n` and `<I18n>` are two skins over the same **load gate**: wait for the namespaces you asked for, show `fallback` until they are ready, then hand you a scoped i18n bag.

| API                                                      | Role                                                    |
| -------------------------------------------------------- | ------------------------------------------------------- |
| **`withI18n<P, R?>({ namespaces, fallback? }, render)`** | `t` in the whole component body; HOC forwards `ref`     |
| **`<I18n namespaces={…} fallback={…}>`**                 | stateful shell above; `t` only in the children function |

`withI18n` takes options plus a render function with **three arguments**, kept separate on purpose:

1. **Own props** (`P`) — your component props only
2. **i18n** (`I18nProps<Ns>`) — `{ t, locale, pendingLocale? }`
3. **`ref?`** — optional forwarded ref (not part of the i18n bag)

That avoids merging `t` / `locale` into props (and the name collisions that would invite). Declare own props (and optional ref type) as `withI18n<P, R?>`.

Optional **`fallback`** is `ReactNode | ((props: P) => ReactNode)` — a function when the waiting UI needs own props. It lives next to `namespaces` in the options object. On `<I18n>`, `fallback` stays a plain node because the parent already has those props in scope.

```tsx
type InvoiceProps = { count: number };

const Invoice = withI18n<InvoiceProps>(
  {
    namespaces: ["billing", "user"],
    fallback: ({ count }) => <p>Loading invoice ({count})…</p>,
  },
  function Invoice({ count }, { t, locale }) {
    return <p>{t("billing", "invoice_summary", { count })}</p>;
  }
);

function Checkout() {
  const [step, setStep] = useState(0); // preserved while namespaces load
  return (
    <I18n namespaces={["billing"]} fallback={null}>
      {({ t }) => <p>{t("billing", "invoice_summary", { count: 1 })}</p>}
    </I18n>
  );
}
```

While the requested namespaces are still loading, the load gate renders `fallback` and does not mount your wrapped body. On locale change, the **keep-then-switch** policy keeps the last ready bag visible (and may set `pendingLocale`) instead of flashing fallback when a previous snapshot exists.

---

## Why not Suspense for i18n

A child that suspends unmounts everything up to the nearest `<Suspense>`. Ancestors between the boundary and the suspender lose local state. Mixing i18n into that channel also makes it impossible for the load gate to know whether _our_ translations or some other library suspended.

Instead the load gate tracks **our** promise status and renders `fallback` locally. Unrelated Suspense elsewhere in the app is untouched.

---

## Setup

Keep the two codegen steps as separate scripts, and add one that runs both:

```json
{
  "scripts": {
    "i18n:codegen-core": "xndrjs-i18n-codegen --config src/i18n/i18n.codegen.json",
    "i18n:react-codegen": "xndrjs-i18n-react-codegen --config src/i18n/i18n.codegen.json",
    "i18n:codegen": "pnpm run i18n:codegen-core && pnpm run i18n:react-codegen"
  }
}
```

After changing translations or `i18n.codegen.json`, run `i18n:codegen` (or the two steps individually). Commit `react-bindings.generated.tsx` with the rest of the generated i18n output.

---

## Examples

### Lazy multi (split-by-locale) + hydrate

On the server, `load()` then `serialize()`. Pass that state into the lazy root so client gates for those namespaces can resolve on the first paint instead of flashing fallback.

```tsx
// app/multi/page.tsx — Server
import { createI18n } from "@/i18n";
import { MultiClientDemo } from "./client-demo";
import { I18nRoot } from "@/i18n/generated/react-bindings.generated";

export default async function Page({ searchParams }) {
  const locale = /* … */;

  const i18n = createI18n();
  const { t } = await i18n.load({
    namespaces: ["default", "user", "billing"],
    locale,
  });
  const state = i18n.serialize();

  return (
    <>
      <p>{t("default", "welcome", { name: "Server" })}</p>
      <I18nRoot locale={locale} state={state}>
        <MultiClientDemo locale={locale} />
      </I18nRoot>
    </>
  );
}
```

```tsx
"use client";

import { I18n, I18nLazyRoot, withI18n } from "@/i18n/generated/react-bindings.generated";
import type { MyProjectLocale } from "@/i18n/generated/i18n-types.generated";

const DefaultPanel = withI18n(
  {
    namespaces: ["default"],
    fallback: <p>Loading…</p>,
  },
  function DefaultPanel(_props, { t }) {
    return <p>{t("default", "welcome", { name: "Client" })}</p>;
  }
);

export function MultiClientDemo({
  locale,
  state,
}: {
  locale: MyProjectLocale;
  state?: {
    dictionary: Record<string, unknown>;
    resources: readonly (readonly [string, string])[];
  };
}) {
  return (
    <I18nLazyRoot locale={locale} state={state}>
      <DefaultPanel />
      <I18n namespaces={["user", "billing"]} fallback={<p>Loading translations…</p>}>
        {({ t }) => (
          <>
            <p>{t("user", "greeting", { name: "Lena" })}</p>
            <p>{t("billing", "invoice_summary", { count: 3 })}</p>
          </>
        )}
      </I18n>
    </I18nLazyRoot>
  );
}
```

### Eager multi + forwarded ref

```tsx
"use client";

import { useRef } from "react";
import { I18n, I18nEagerRoot, withI18n } from "@/i18n/generated/react-bindings.generated";
import type { MyProjectLocale } from "@/i18n/generated/i18n-types.generated";

type HeroProps = { name: string };

const Hero = withI18n<HeroProps, HTMLHeadingElement>(
  { namespaces: ["default"] },
  function Hero({ name }, { t, locale }, ref) {
    return (
      <h1 ref={ref}>
        {t("default", "welcome", { name })} <code>{locale}</code>
      </h1>
    );
  }
);

export function EagerClientDemo({ locale }: { locale: MyProjectLocale }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <I18nEagerRoot locale={locale}>
      <Hero ref={headingRef} name="Ada" />
      <I18n namespaces={["cms"]}>
        {({ t }) => (
          <>
            <p>{t("default", "welcome", { name })}</p>
            <footer>{t("cms", "footer_note")}</footer>
          </>
        )}
      </I18n>
    </I18nEagerRoot>
  );
}
```

---

## Design notes

1. **Core stays framework-agnostic** — ICU, builder, and codegen live in `@xndrjs/i18n`.
2. **Types live in generated code** — schema types and scoped `t` both come from codegen.
3. **Generic `withI18n` / `I18n`** — multi-namespace lists, one scoped `t`, own props separate from the i18n bag.
4. **No Suspense on the i18n load path** — manual status + colocated fallback.
5. **Server-first** — `load()` + `serialize()` on the server; providers and gates only where the client needs them.

---

## Final words

`@xndrjs/i18n-react` is the evolution of the thin React layer the first article pointed at: shared instance, load coordination, colocated HOC/gate wait UI, and `t` typed for the namespaces you ask for — without leaning on Suspense for i18n loads. Suspense’s API is too coarse to tell _where_ a suspension came from; routing i18n through it would invite unexpected behavior elsewhere in the tree.

On the server, keep using `createI18n` and `load()` as before (and `serialize()` when you want to hydrate). On the client, import `I18nLazyRoot` or `I18nEagerRoot` and `withI18n` / `I18n` from `react-bindings.generated.tsx`.

One extra codegen command if you already run `xndrjs-i18n-codegen`.

---

**Related links**

- [Type-safe i18n and flexible delivery](/blog/type-safe-i18n-with-flexible-delivery/) — core engine and delivery
- [Docs: i18n](/v0/infrastructure/i18n/) — runtime, lazy loading, delivery
- [Demo app (Next.js)](https://github.com/xndrjs/toolkit/tree/main/apps/i18n-demo) — four profiles, server + client
- [GitHub: @xndrjs/i18n-react](https://github.com/xndrjs/toolkit/tree/main/packages/i18n-react)
