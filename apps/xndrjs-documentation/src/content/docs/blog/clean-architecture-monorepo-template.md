---
title: "A Clean Architecture monorepo template for fullstack TypeScript"
description: Recurring pain in custom fullstack apps — coupling, sprawling PRs, untestable cores, weak architecture enforcement, and team friction — and how a governed monorepo template maps Clean Architecture into a workspace you can actually ship.
date: 2026-07-31
author: Fabio Fognani
tags:
  - architecture
  - monorepo
  - clean-architecture
  - typescript
---

Every fullstack TypeScript team eventually faces the same truth: **a greenfield app is easy; a greenfield _architecture_ is not**. Frameworks give you routes and components. Vendors give you SDKs and generated types. Neither tells you where business rules live, what may depend on what, or how to keep the next feature from dragging half the system into one pull request.

This post is about a monorepo template built for that gap:

**[github.com/xndrjs/monorepo](https://github.com/xndrjs/monorepo)**

It is not a demo product. It is a **contract**: folder layout, naming, dependency rules, generators, and agent skills — oriented around Clean Architecture, and powered by the `xndrjs` toolkit.

What follows is the map of pressures I care about, how the workspace answers them, and why the upfront cost is intentional.

---

## What usually goes wrong

### Business logic glued to the wrong surface

In many apps, “the domain” is whatever happens to sit next to the UI or the route handler. Rules live inside React hooks that only run on the client. Use cases import Next.js APIs. Components consume Contentful (or GraphDB, or payment SDK) types directly.

When that happens, you do not have portable business logic. You have logic that only exists _inside one runtime, one framework, one vendor_. Change the CMS, move a rule to the server, or reuse an orchestration from a CLI — and you rewrite the heart of the feature, not just an adapter.

### No shared answer to “where does this go?”

Without a durable vocabulary, every team invents a private topology. `utils`, `common`, `helpers`, `lib`, `shared` — packages that grow until nobody knows what belongs inside them. Dependencies point sideways. God modules appear because nothing prevents it.

The cost is not only technical. It is cognitive: every new contributor spends days reconstructing conventions that were never written down — or were written down and then ignored.

### Architecture as folklore

Reviews catch the worst leaks when reviewers have time and context. CI usually does not. “We don’t import infrastructure from core” is a guideline until a deadline, an inattentive merge, or an LLM that optimizes for the path in front of it.

If the boundary is not executable, it is optional. Optional boundaries will erode.

### Features without a cut line

When domain modeling, orchestration, infrastructure wiring, and UI all live in the same mental bag, every ticket becomes a vertical monolith of a PR. Reviewers cannot isolate the decision that matters. Parallel work collides. Rollback is expensive.

Huge PRs are rarely a people problem. They are a missing boundary problem.

### Tests that can only be integration tests

Couple the use case to a mocked CMS call and a React tree, and the “unit” test suite is already an integration suite. Nobody seriously argues for hitting the live CMS in CI — the trap is subtler: mocking the HTTP request still ties the test to a vendor wire shape. What remains cheaply and truly unit-testable is often the least important code. The rules that should be easy to verify become the ones that need HTTP fixtures for everything.

### AI without rails

Assistants are very good at completing the local path: make the type error go away, make the page render, make the test pass. Without skills, generators, and hard architectural fails, that local optimum often means leaking a vendor type into the UI, putting a use case next to a hook, or opening a dependency the matrix never allowed.

Speed without structure accelerates debt.

### Custom everything, shared nothing across projects

One more pressure sits at the team level. When every product is a custom project with its own names for the same ideas, people are not interchangeable. Moving someone onto “another” TypeScript fullstack app still feels like learning a new codebase from scratch — even when the business problems are similar.

That tax shows up as slow onboarding, siloed ownership, and review quality that depends on who already lives in that repo’s folklore.

Those seven pressures — coupling, disorientation, weak enforcement, oversized PRs, fragile tests, unguided AI, and team lock-in — frame the problem. Everything below is how the template addresses it on each front.

---

## Clean Architecture, as a workspace

Clean Architecture’s useful core is simple: **dependencies point inward**. Domain and application policies stay free of frameworks and vendors. Adapters and delivery mechanisms sit at the edge. Something has to wire the graph — namely a composition root — without letting that wiring leak into every module.

The monorepo turns that idea into places you can open in the file tree:

| Clean Architecture idea            | In the workspace                                                 |
| ---------------------------------- | ---------------------------------------------------------------- |
| Entities / domain model            | `@core/<feature>/models`                                         |
| Domain operations                  | `@core/<feature>/operations`                                     |
| Core errors (domain + application) | `@core/<feature>/errors`                                         |
| Use cases                          | `@core/<feature>/use-cases`                                      |
| Outbound ports                     | `@core/<feature>/ports` — business names, never vendor names     |
| Adapters                           | `@infrastructure/<name>`                                         |
| Presentational UI                  | `@ui/*` — shared, “dumb” components                              |
| Entry points                       | `apps/*`                                                         |
| Composition / DI                   | `apps/*/composition` — the only place that may import everything |

A **core** package is a vertical slice for a bounded context (`@core/billing`), not a horizontal dump of “all models.” Inside it, the dependency story stays strict: errors and models sit at the center; operations build on models; ports describe outbound needs; use cases orchestrate models, operations, and ports.

**Infrastructure** speaks vendor and technology (`infrastructure-contentful`, `infrastructure-s3`). Loaders fetch raw payloads. Repositories implement ports and map into domain shapes. The UI never imports the CMS SDK to "fetch an article" — it asks the application for a use case that was wired in composition.

**Specs** live outside packages (`SPEC.md` / `DESIGN.md`). Product intent is not an implementation detail buried next to a React component.

The [toolkit](https://github.com/xndrjs/toolkit) is not the folder layout. It supplies domain primitives — shapes, validators, proofs, capabilities — so core packages model data the same way across projects. The monorepo is the governance system that decides _where_ those primitives live and _what_ may import them.

### Why a monorepo?

Could the same architecture live as separate repositories? In principle, yes.

This template is a monorepo because its moving parts are meant to cohabit: generators that scaffold across apps and packages, one dependency graph that boundary lint can enforce, shared `@core` / `@infrastructure` / `@ui` packages without publish-and-pin churn, composition roots that wire the whole workspace, and agent skills that assume a single topology.

That same layout makes cross-app reuse ordinary: an operator-facing app and an admin dashboard can share use cases and adapters without copying them or version-pinning an internal package across repos.

Split that across a polyrepo and you spend more time synchronizing contracts than enforcing them. Monorepo here is a cohesion choice — not a religion.

---

## Domain modeling without rich objects

Inside `@core`, data is not a classic rich OOP aggregate with methods on instances — and it is not a free-for-all of mutable anemic DTOs either.

The bet, described at length in [xndrjs Domain Algebra](/blog/xndrjs-domain-algebra-rich-anemic/) and [Trusted Shape Modeling](/blog/object-oriented-modeling-vs-trusted-shape-modeling/), is a third path:

- **Anemic on the surface**: values are plain, immutable, serializable data — easy to move across layers, SSR/CSR boundaries, and tests.
- **Correct by construction at the gates**: unknown input enters through validated shapes; invalid values are hard to represent by accident.
- **Capabilities are armored transitions**: behavior lives _alongside_ the data, bound with an explicit `attach`. Updates go through `patch`, which re-validates. You do not mutate fields in place; you name the transition and get a new trusted value back.

In short: mobility of anemic models, guarantees closer to rich models — without DTOs for every hop and without hoping every method author remembered to validate.

This post will not re-argue the algebra. If you want the full design rationale, start with those two articles. What matters for the monorepo is the consequence: **core stays framework-free and vendor-free**, and operations stay segregated inside it — they do not leak into apps by accident, so business logic is not spread across the delivery layer.

---

## How the template answers the pressures

### Coupling → ports, boundaries, and composition

Core packages cannot import React, Next, or infrastructure SDKs — ESLint `boundaries` and restricted imports make that a merge blocker, not a style preference. Ports are role-oriented (`CmsPort`, not `ContentfulClient`). Apps call public roots from composition (`getBillingRoot(ctx)`); they do not new up infrastructure in a page component.

Same use case, different runtimes: wire it once for the server composition file, once for the client if needed. The orchestration does not live inside a hook that cannot run on the server.

### Disorientation → generators and a stable vocabulary

Plop scaffolds cores, ports, use cases, infrastructure packages, and composition roots with the filenames the lint rules expect (`*.use-case.ts`, `*.port.ts`, `*.composition.ts`, …). Agents get the same generators through an MCP server. The question “where does this go?” has a default answer before anyone invents a `utils` core.

Vertical slices and an explicit ban on catch-all cores reduce god packages. Infrastructure splits by vendor first, then by context when reuse appears — so S3-the-SDK and S3-for-this-export-flow do not have to be the same package forever.

### Folklore → executable architecture

Dependency matrices fail the build. Filename blocklists catch scaffold drift. Custom rules gate infrastructure-to-infrastructure imports behind allowlists. Documentation in `architecture/` is the human source of truth; ESLint is the machine one.

Reviews still matter. They stop being the only line of defense.

### Huge PRs → seams and a phased feature workflow

Specs and design docs can land before code. Capability-oriented folders give natural cut lines. The feature workflow is phased on purpose (map → spec → design → scaffold → implement → …), with checkpoints between phases — including for AI agents — so one run does not try to invent the domain, the adapters, and the UI in a single unreviewable blast.

Smaller blast radius is a product of clearer seams, not of asking people to “open smaller PRs” while the codebase refuses to split.

### Testing → fake the edge, unit the core

Use cases are factories over ports. Tests pass fakes. Domain capabilities and services are pure enough to test without a browser. Infrastructure mappers get unit tests; loaders stay raw. Integration and E2E belong in apps, where composition and frameworks actually exist.

Vitest is split into `node` and `react` projects so the default test shape matches the layer you are in.

### AI → skills, hard stops, generator-owned wiring

Agent entrypoints (`AGENTS.md`, shared skills across Cursor/Claude/Codex/…) teach the same topology humans use. Violating a boundary fails lint. Composition roots are not freehand invention. The assistant still writes code; it writes it into a shape the repo already agreed on.

Related reading: [AI doesn't make DDD less important](/blog/ai-makes-domain-driven-design-essential/) and [Parsing-slop](/blog/parsing-slop-a-particular-form-of-ai-slop/).

### Team working → shared vocabulary across products

When several projects share the same names for the same ideas — core, port, use case, composition root, loader vs repository — onboarding compresses. A developer who already knows one product can open another and navigate by structure instead of archaeology.

People become more interchangeable not because the _business_ is identical, but because the _engineering dialect_ is. Reviews get sharper: “this belongs in a port” means the same thing in every repo that adopted the template. That is hard to get from a pile of one-off custom apps, no matter how talented the individuals are.

---

## What this is not

It is not a pre-built SaaS. `apps/` and `packages/` start empty on purpose — the value is the contract, not a sample storefront.

It is not a replacement for Next, React, or your CMS. Those stay at the edge, where they belong.

It is not “just folders.” Folders without enforcement and workflow become suggestions. The template’s bet is that **structure + generators + lint + skills** together change the default economics of the codebase: the easy path is the architectural one.

And the split of responsibility stays honest: the toolkit does not organize your monorepo; the monorepo does not invent domain kits. Together they close the loop.

---

## Upfront cost, intentional payoff

Adopting this style costs more on day one than a totally custom app that “just ships the page.” You learn a vocabulary. You write ports. You go through generators. You accept that CI will refuse some shortcuts.

That is strategic programming in John Ousterhout’s sense (_A Philosophy of Software Design_): invest in designability instead of optimizing only for the next tactical win.

The return shows up sooner than “someday”:

- smaller, reviewable PRs;
- unit tests on the rules that matter;
- fewer debates about where code belongs;
- AI assistance that stays on the rails;
- teams that can move between products without relearning how the house is built.

If the template becomes the standard base for your projects, each new one inherits that compression. The cognitive load per product drops — not because the products got simpler, but because the shared foundation stopped being renegotiated every time.

And one last point, because it is easy to misread the weight of day one.

**This template does not introduce complexity. It makes complexity visible.**

If the first weeks feel dense — too many names, too many places, too many distinctions — that is not accidental ceremony. The structure is surfacing details that were always there, and it forces the questions you should be asking anyway: what is domain, what is adapter, what may depend on what.

A layout that hides complexity does not remove it. It only postpones the bill — until the cost of having hidden it becomes obvious.

---

## Where to go next

- Monorepo template: [github.com/xndrjs/monorepo](https://github.com/xndrjs/monorepo)
- Architecture contract in that repo: `architecture/clean-architecture-oriented-monorepo.md`
- Domain primitives: [`@xndrjs/domain`](/v0/domain/overview/) and the [Domain Algebra](/blog/xndrjs-domain-algebra-rich-anemic/) / [Trusted Shape Modeling](/blog/object-oriented-modeling-vs-trusted-shape-modeling/) posts
- Toolkit overview: [Getting started](/v0/getting-started/introduction/)
