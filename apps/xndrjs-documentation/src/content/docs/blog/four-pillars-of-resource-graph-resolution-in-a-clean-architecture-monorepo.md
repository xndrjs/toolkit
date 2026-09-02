---
title: "The four pillars of resource graph resolution in a Clean Architecture monorepo"
description: Where resources, data sources, graph strategy, and domain mapping belong in a governed Clean Architecture monorepo.
date: 2026-09-02
author: Fabio Fognani
tags:
  - architecture
  - monorepo
  - clean-architecture
  - cms
  - typescript
---

The previous post on [resource graph resolution](/blog/every-component-fetches-its-own-data-until-it-cant/) was about how to resolve complex domain aggregates across multiple backends, via a unified resource graph resolver.

Once you accept that model, the next question is: **where in the repository should resource identities, data sources, mappers, and the rest live — while still respecting Clean Architecture on a complex project?**

The answer I use in production-shaped workspaces built from the [xndrjs monorepo template](https://github.com/xndrjs/monorepo) rests on four pillars. They are the same four ideas sketched at the end of the earlier article; here we treat them as **architectural commitments** with a home in the file tree.

---

## What this post does not repeat

<!-- TODO: refine — keep short, link out -->

Scheduling modes, island semantics, and the DataSource contract belong in the [resource graph resolver guide](/v0/infrastructure/resource-graph-resolver/). Domain algebra and package boundaries belong in the [Clean Architecture monorepo template](/blog/clean-architecture-monorepo-template/) post.

Here we only connect the two: **how the four pillars map into a governed monorepo**, and why strategy and mapping belong together in a **repository package** — not in composition.

---

## Four pillars, one walk

<!-- TODO: refine — one paragraph per pillar, no API names -->

Think of an aggregate resolution as four separable decisions:

1. **Resources** — what can be addressed at all (stable identities for nodes in the graph).
2. **Data sources** — which transport channels know how to load which identities, under which batching and concurrency limits.
3. **Graph resolution strategy** — how a resolved node reveals further identities, and how the complete graph should be split for caching purposes.
4. **Mapping** — how the resolved infrastructure graph becomes the model the application actually reasons about.

The resolver library implements the walk. The monorepo decides **who owns each pillar** and **which layer may import which**.

---

## Pillar 1 — Resources (identities)

<!-- TODO: refine — ARIs as infrastructure vocabulary, not domain IDs -->

Resources are not “database rows” and not domain entities. They are **infrastructure identities**: typed handles for things your backends already expose — CMS entries, assets, integration snapshots, and similar.

In a Clean Architecture workspace they live at the **outer, vendor-facing edge**: declared next to the adapters that understand those backends, not inside core packages. Apps should use a **domain aggregate** — the result of a use case — not a partial vendor-specific payload and the knowledge of how to walk the graph to reconstruct that aggregate themselves.

The point is separation of vocabulary. Infrastructure speaks in resources and payloads; domain speaks in business concepts. Conflating the two is how “fetch the hero” ends up inside a React hook, forcing you to rewrite your components when the CMS changes.

---

## Pillar 2 — Data sources (transport channels)

<!-- TODO: refine — one channel per endpoint, limits as facts, thin loaders -->

A **data source** is one transport channel: the identities it accepts, how large a batch it tolerates, how many batches it runs in parallel, and the function that performs one load.

Real CMS integrations often need **more than one data source per vendor** — entries and assets on separate HTTP surfaces are the common case. The resolver routes each pending identity to the first matching channel.

Data sources belong in **infrastructure packages** alongside the client that actually talks to the vendor. They fetch and correlate; they do not encode product rules about what an aggregate “is”. Retry, backoff, and vendor-specific query shaping stay inside the channel, where they can evolve without touching core.

---

## Pillar 3 — Graph resolution strategy (topology)

<!-- TODO: refine — repository package assembles; vendor packages may export expansion slices -->

The **graph resolution strategy** answers a different question from transport: _given this resolved payload, which identities must appear next — and how should the complete graph be split for caching purposes?_

That knowledge is shaped by your **content model and the contracts between systems**. A CMS module that carries a product SKU implies a link into the integration graph; a news reference may imply another backend. The strategy is where those cross-system relationships become explicit — not in React, not in a hook.

This is not fully vendor-agnostic in practice. A change of CMS or integration vendor will almost certainly force you to revisit expansion rules: payload shapes, link metadata, and field names may not be totally interchangeable unless the resource graph looks exactly the same. The repository will tend to carry **some shared knowledge** across the services involved — and that is expected.

Vendor infrastructure packages can still **externalize** the expansion knowledge they own: a Contentful package exports policies that know how its entries and assets link outward; an integration package exports policies for product references. The **repository package** starts from a product-level skeleton and **enriches** it with those vendor contributions — the same place that will later map the resolved graph into domain shapes.

Strategy does **not** pass through composition. Mapping does not either: neither should be redefined from one runtime or app entrypoint to another — that is repository work, not composition-root work. Composition binds runtime; it does not redefine graph topology or how aggregates are projected into domain shapes.

---

## Pillar 4 — Mapping (into domain)

<!-- TODO: refine — ContentMap as IR, repository package, cross-vendor by necessity -->

The resolver’s output is an intermediate representation: a map of resolved resources and payloads, plus island membership and dependencies when you need them. That is still **infrastructure dialect**.

**Mapping** is the step that turns that graph into domain-trusted shapes — the aggregate your application exposes to UI and policies. Unlike expansion rules, which a vendor package can largely own for _its_ payloads, mapping **must** know how each vendor’s resolved data fits the aggregate you are building. A page mapper that hydrates a product strip cannot stay ignorant of the integration payload shape. Mapping inevitably **crosses vendor boundaries**.

That is why mapping lives in the **repository package** alongside the graph strategy — the module that owns “resolve this aggregate for this product” end to end. It does not belong in composition: it must not be redefined between runtimes or apps. Core stays free of CMS SDKs and free of graph-walking rules. Apps call a use case that delegates to the repository layer; they do not assemble partial payloads or rediscover graph edges themselves.

---

## Where each pillar lives in the monorepo

<!-- TODO: refine — table or prose mapping pillar → @infrastructure / @core / apps -->

| Pillar                    | Typical home                                                                 | Depends inward on                              |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| Resources                 | Infrastructure packages (identities + registry slices)                       | Application resource primitives only           |
| Data sources              | Infrastructure adapters (one package per vendor or channel)                  | Resources, vendor clients                      |
| Graph resolution strategy | Repository package (may import expansion/island slices from vendor packages) | Resources, link metadata, vendor graph modules |
| Mapping                   | Repository package (same module as strategy — cross-vendor by necessity)     | Core domain shapes, resolver output            |

Apps and UI consume **use cases** that delegate to the repository package — not raw resolver types or vendor payloads scattered in components.

---

## The repository package: strategy, resolve, map

<!-- TODO: refine — single ownership module, vendor slices imported -->

In a production monorepo, the **repository package** is the home for aggregate resolution: it assembles the graph strategy (enriched from vendor packages where helpful), wires data sources into the resolver, and maps the resulting content graph into domain shapes.

That module is rebuilt when backends or the content graph change. Runtime dependencies (which store, which credentials, which observer) still flow in through factories at the edge, but the **topology and the mapping** stay here. Keeping strategy and mapping together reflects a simple rule: anything that must understand the full multi-vendor graph belongs in one reviewed place, not split across composition roots and UI.

---

## Composition: runtime wiring only

<!-- TODO: refine — contrast with ports/adapters, what composition actually binds -->

The composition root’s job remains what Clean Architecture always said: choose concrete implementations for ports, inject context, expose narrow façades to delivery mechanisms.

For resource graphs that means composition binds **runtime** — authenticated clients, environment, catalogs, optional observers — and hands delivery code a **use case** backed by the repository package. It does **not** assemble graph strategy or mappers. Those already encode how this product’s aggregates are resolved and projected; composition only decides _which instances_ run today.

---

## End-to-end: one aggregate request

<!-- TODO: refine — narrative walkthrough, monorepo paths at high level only -->

At a high level, resolving a domain aggregate — a localized page is the familiar example — flows like this:

1. Delivery (route, server action, or equivalent) asks the application for the aggregate.
2. An orchestrating use case delegates to the **repository package** with a root resource identity and execution context (locale, preview flags, and similar).
3. The repository runs the resolver walk — data sources load, the assembled strategy expands, islands accumulate.
4. The same module maps the content graph into domain shapes the core understands.
5. UI renders from domain shapes, not from vendor JSON.

No step in the delivery layer discovers new resources on its own. Discovery already happened in the walk.

---

## Islands, cache, and backing (downstream concerns)

<!-- TODO: refine — optional section, serializer as app/infrastructure policy -->

Islands name subgraphs with their own identity — useful when different slices have different lifetimes or cache policies. The resolver tracks membership and dependencies; **invalidation strategy** remains an application concern.

Serialization, tiered cache, and promoting backing resources are patterns you may adopt around the walk. They are not part of the four pillars; they consume the resolver’s output after the graph is known.

---

## What the resolver deliberately does not decide

<!-- TODO: refine — mirror “library does not decide” from first post, monorepo angle -->

The engine does not define what a page or product **means**, which vendor you use, how aggressively to cache, or how React should render. The monorepo template enforces the same boundary structurally: core packages must not import infrastructure SDKs, and graph-walking rules must not hide inside hooks.

That restraint is what keeps the mechanism reusable across products while still letting each product commit to its own graph in one repository module — reviewed when content types, vendors, or aggregate shapes change.

---

## Workshop demo vs production monorepo

<!-- TODO: refine — demo integrates for teaching; monorepo separates for shipping -->

The toolkit demo application collapses wiring to minimize the amount of code and keep it simple and stupid. But such a demo will never have to scale or suddenly change infrastructure. A production workspace from the monorepo template separates the same ideas into packages, ports, and enforceable import rules.

The mental model is identical; the **seams** are sharper. This post describes the production-shaped layout.

---

## Further reading

- [Every component fetches its own data, until it can't](/blog/every-component-fetches-its-own-data-until-it-cant/) — the resolution problem and mechanism
- [Resource graph resolver (docs)](/v0/infrastructure/resource-graph-resolver/) — API and scheduling reference
- [A Clean Architecture monorepo template](/blog/clean-architecture-monorepo-template/) — workspace governance and layers
- [From Query Keys to Application Resource Identifiers](/blog/from-query-keys-to-application-resource-identifiers/) — why infrastructure identities exist
- [Contentful to Zod](/v0/infrastructure/contentful-to-zod/) — transport schemas and link metadata for expansion authoring
- Monorepo template: [github.com/xndrjs/monorepo](https://github.com/xndrjs/monorepo)
