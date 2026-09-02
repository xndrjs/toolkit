---
title: "Where resource graphs live in a Clean Architecture monorepo"
description: After the resolution engine comes the harder question — where each pillar belongs in a governed monorepo, what stays infrastructure, and why graph strategy is a repository invariant rather than composition wiring.
date: 2026-09-02
author: Fabio Fognani
tags:
  - architecture
  - monorepo
  - clean-architecture
  - cms
  - typescript
---

The previous post on [resource graph resolution](/blog/every-component-fetches-its-own-data-until-it-cant/) was about the **mechanism**: how a walk discovers resources, batches loads across backends, and returns a typed graph before rendering.

This one is about **placement**. Once you accept that model, the next question is not “how does batching work?” but “where in the repository do I declare identities, transport, topology, and domain mapping — and what must never leak inward?”

The answer I use in production-shaped workspaces built from the [xndrjs monorepo template](https://github.com/xndrjs/monorepo) rests on four pillars. They are the same four ideas sketched at the end of the earlier article; here we treat them as **architectural commitments** with a home in the file tree.

---

## What this post does not repeat

<!-- TODO: refine — keep short, link out -->

Scheduling modes, island semantics, and the DataSource contract belong in the [resource graph resolver guide](/v0/infrastructure/resource-graph-resolver/). Domain algebra and package boundaries belong in the [Clean Architecture monorepo template](/blog/clean-architecture-monorepo-template/) post.

Here we only connect the two: **how the four pillars map into a governed monorepo**, and why some of them are wired once as infrastructure invariants rather than recreated in every composition root.

---

## Four pillars, one walk

<!-- TODO: refine — one paragraph per pillar, no API names -->

Think of a page resolve as four separable decisions:

1. **Resources** — what can be addressed at all (stable identities for nodes in the graph).
2. **Sources** — which transport channels know how to load which identities, under which batching and concurrency limits.
3. **Graph resolution strategy** — how a resolved node reveals further identities, and where the walk should carve optional island boundaries.
4. **Mapping** — how the resolved infrastructure graph becomes the model the application actually reasons about.

The resolver library implements the walk. The monorepo decides **who owns each pillar** and **which layer may import which**.

---

## Pillar 1 — Resources (identities)

<!-- TODO: refine — ARIs as infrastructure vocabulary, not domain IDs -->

Resources are not “database rows” and not domain entities. They are **infrastructure identities**: typed handles for things your backends already expose — CMS entries, assets, integration snapshots, and similar.

In a Clean Architecture workspace they live at the **outer, vendor-facing edge**: declared next to the adapters that understand those backends, not inside core packages. Core should ask for a page aggregate or a use case result; it should not import CMS entry shapes to discover what to fetch next.

The point is separation of vocabulary. Infrastructure speaks in resources and payloads; domain speaks in business concepts. Conflating the two is how “fetch the hero” ends up inside a React hook.

---

## Pillar 2 — Sources (transport channels)

<!-- TODO: refine — one channel per endpoint, limits as facts, thin loaders -->

A **source** is one transport channel: the identities it accepts, how large a batch it tolerates, how many batches it runs in parallel, and the function that performs one load.

Real CMS integrations often need **more than one source per vendor** — entries and assets on separate HTTP surfaces are the common case. The resolver routes each pending identity to the first matching channel; it does not merge unrelated endpoints on your behalf.

Sources belong in **infrastructure packages** alongside the client that actually talks to the vendor. They fetch and correlate; they do not encode product rules about what a page “is”. Retry, backoff, and vendor-specific query shaping stay inside the channel, where they can evolve without touching core.

---

## Pillar 3 — Graph resolution strategy (topology)

<!-- TODO: refine — vendor-agnostic, content-model-shaped, NOT composition -->

The **graph resolution strategy** answers a different question from transport: _given this resolved payload, which identities must appear next — and should this node open a new island boundary?_

That knowledge is shaped by your **content model and linking rules**, not by which HTTP client you use. Swapping vendors might change sources; it should not silently rewrite which modules a page expands into unless the underlying content model changed.

For that reason I treat the strategy as a **repository invariant**: declared once in infrastructure, versioned with the content graph, reviewed when content types or cache boundaries change. It is vendor-agnostic in the same way link-field metadata is vendor-agnostic — it describes relationships in your graph, not SDK calls.

It does **not** belong in the composition root. Composition is where you bind runtime context — authenticated clients, environment, optional observers — not where you redefine graph topology per app entrypoint.

---

## Pillar 4 — Mapping (into domain)

<!-- TODO: refine — ContentMap as IR, orchestrator/use case, domain-zod -->

The resolver’s output is an intermediate representation: a map of resolved resources and payloads, plus island membership and dependencies when you need them. That is still **infrastructure dialect**.

**Mapping** is the step where orchestration turns that graph into domain-trusted shapes — the page aggregate your application exposes to UI and policies. It belongs above raw transport and below presentation: typically an orchestrator or use case that calls resolve, then applies mappers that understand both the content map and your domain model.

Core stays free of CMS SDKs and free of graph-walking rules. It receives results it can trust, produced by explicit transformations at the boundary.

---

## Where each pillar lives in the monorepo

<!-- TODO: refine — table or prose mapping pillar → @infrastructure / @core / apps -->

| Pillar                    | Typical home                                                | Depends inward on                                   |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| Resources                 | Infrastructure packages (identities + registry slices)      | Application resource primitives only                |
| Sources                   | Infrastructure adapters (one package per vendor or channel) | Resources, vendor clients                           |
| Graph resolution strategy | Infrastructure graph module (stable with content model)     | Resources, generated link metadata where applicable |
| Mapping                   | Orchestration at the boundary (use case + mappers)          | Core domain shapes, resolver output                 |

Apps and UI consume **use cases** or composed roots — not raw resolver types scattered in components.

---

## Resolver and strategy as infrastructure modules

<!-- TODO: refine — factory pattern, topology fixed, deps injected -->

The resolver itself is assembled in infrastructure: sources plus strategy plus scheduling choices form a **topology** for the product. That assembly is rebuilt when backends or content topology change, not on every request.

Runtime dependencies — which store, which credentials, which observer — may flow in through factories. The graph strategy does not. Keeping topology out of composition reduces the risk that a new app entrypoint accidentally forks the walk, and it makes the content graph a single place to review when editors add a module type.

---

## Composition: runtime wiring only

<!-- TODO: refine — contrast with ports/adapters, what composition actually binds -->

The composition root’s job remains what Clean Architecture always said: choose concrete implementations for ports, inject context, expose narrow facades to delivery mechanisms.

For resource graphs that means composition might wire **which catalog**, **which CMS space**, or **which observer** a resolve call uses — but not **which children a page entry expands into**. That distinction is the whole point: composition binds the world as it runs today; infrastructure declares the shape of the graph your product assumes.

---

## End-to-end: one page request

<!-- TODO: refine — narrative walkthrough, monorepo paths at high level only -->

At a high level, a localized page request flows like this:

1. Delivery (route, server action, or equivalent) asks the application for a page.
2. An orchestrating use case starts from a root resource identity and execution context (locale, preview flags, and similar).
3. Infrastructure runs the pre-declared resolver walk — sources load, strategy expands, islands accumulate.
4. Mappers project the content map into domain aggregates the core understands.
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

The engine does not define what a page or product **means**, which vendor you use, how aggressively to cache, or how React should render. The monorepo template enforces the same boundary structurally: core packages must not import infrastructure SDKs, and graph topology must not hide inside hooks.

That restraint is what keeps the mechanism reusable across products while still letting each product commit to its own graph in one reviewed place.

---

## Workshop demo vs production monorepo

<!-- TODO: refine — demo integrates for teaching; monorepo separates for shipping -->

The toolkit demo application collapses wiring to stay readable in a workshop. A production workspace from the monorepo template separates the same ideas into packages, ports, and enforceable import rules.

The mental model is identical; the **seams** are sharper. This post describes the production-shaped layout.

---

## Further reading

- [Every component fetches its own data, until it can't](/blog/every-component-fetches-its-own-data-until-it-cant/) — the resolution problem and mechanism
- [Resource graph resolver (docs)](/v0/infrastructure/resource-graph-resolver/) — API and scheduling reference
- [A Clean Architecture monorepo template](/blog/clean-architecture-monorepo-template/) — workspace governance and layers
- [From Query Keys to Application Resource Identifiers](/blog/from-query-keys-to-application-resource-identifiers/) — why infrastructure identities exist
- [Contentful to Zod](/v0/infrastructure/contentful-to-zod/) — transport schemas and link metadata for expansion authoring
- Monorepo template: [github.com/xndrjs/monorepo](https://github.com/xndrjs/monorepo)
