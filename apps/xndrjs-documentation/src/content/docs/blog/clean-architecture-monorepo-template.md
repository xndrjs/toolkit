---
title: "A Clean Architecture monorepo template for fullstack TypeScript"
description: Recurring pain in custom fullstack apps — coupling, sprawling PRs, untestable cores, weak architecture enforcement, and team friction — and how a governed monorepo template maps Clean Architecture into a workspace you can actually ship.
date: 2026-08-01
author: Fabio Fognani
tags:
  - architecture
  - monorepo
  - clean-architecture
  - typescript
  - domain
  - ai
---

Every fullstack TypeScript team eventually faces the same truth: **a greenfield app is easy; a greenfield _architecture_ is not**. Frameworks give you routes and components. Vendors give you SDKs and generated types. Neither tells you where business rules live, what may depend on what, or how to keep the next feature from dragging half the system into one pull request.

This post is about a monorepo template built for that gap:

**[github.com/xndrjs/monorepo](https://github.com/xndrjs/monorepo)**

It is not a demo product. It is an architectural contract: folder layout, naming conventions, dependency rules, generators, and agent skills. Together, they act as guardrails that keep the workspace aligned with Clean Architecture.

What follows are the recurring situations that motivated this template, how the workspace responds to them, and why the upfront cost is intentional.

---

## What usually goes wrong

### Business logic glued to the wrong surface

In many apps, “the domain” is whatever happens to sit next to the UI or the route handler. Rules live inside React hooks that only run on the client. Use cases import Next.js APIs. Components consume vendor types directly. (i.e. from CMS, payment SDK, etc.)

When that happens, you do not have portable business logic. You have logic that only exists _inside one runtime, one framework, one vendor_.

Change the CMS, move a rule to the server, or reuse an orchestration from a CLI — and you rewrite the heart of the feature, not just an adapter.

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

### Custom everything, share nothing across projects

One more pressure sits at the team level. When every product is a custom project with its own names for the same ideas, people are not interchangeable. Knowledge doesn't transfer easily across projects. Moving someone onto “another” TypeScript fullstack app still feels like learning a new codebase from scratch — even when the business problems are similar.

That tax shows up as slow onboarding, siloed ownership, and review quality that depends on who already lives in that repo’s folklore.

---

## Clean Architecture, as a workspace

Clean Architecture’s basic principle is simple: **dependencies point inward**. Domain and application policies stay free of frameworks and vendors. Adapters and delivery mechanisms sit at the edge. Something has to wire the graph — namely a composition root — without letting that "wiring" spread into every module.

The monorepo turns that idea into places you can open in the file tree:

| Clean Architecture idea | In the workspace                                                     |
| ----------------------- | -------------------------------------------------------------------- |
| Domain model            | `@core/<feature>/models`                                             |
| Domain operations       | `@core/<feature>/operations`                                         |
| Core errors             | `@core/<feature>/errors`                                             |
| Use cases               | `@core/<feature>/use-cases`                                          |
| Outbound ports          | `@core/<feature>/ports`                                              |
| Adapters                | `@infrastructure/<name>` — i.e. `@infrastructure/s3-export`          |
| Presentational UI       | `@ui/*` — shared, “dumb” components, i.e. `@ui/react`                |
| Entry points            | `apps/*` — i.e. Next.js, Angular, NestJS, Fastify, Express, a CLI... |
| Composition / DI        | `apps/*/composition`                                                 |

A core package is a vertical slice for a bounded context (@core/billing), rather than a horizontal dump of "all models". A bounded context is an area of the business with its own language, rules, and use cases.

Inside it, the dependency story stays strict: errors and models sit at the center; operations build on models; ports describe capabilities the core expects from the outside world; use cases orchestrate models, operations, and ports.

Domain operations live in `@core/<feature>/operations` and represent domain behavior that does not naturally belong to a single use case. They express domain rules and invariants: the transformations and decisions that must remain valid regardless of which application flow triggers them.

They cover two related ideas:

- **Capabilities**: behavior attached to a single domain value.
- **Domain services**: behavior that works across multiple values or multiple shapes.

Neither is a use case: use cases orchestrate application flows.

Neither is hidden inside mutable OOP objects — behavior lives beside data and produces new trusted values through explicit transformations.

**Infrastructure** speaks vendor and technology (`@infrastructure/contentful`, `@infrastructure/s3`). Loaders fetch raw payloads. Repositories implement ports and map raw into domain shapes. The UI never imports the CMS SDK to "fetch an article" — it asks the application for a use case that was wired in composition.

**Specs** live outside packages (`SPEC.md` / `DESIGN.md`). Product intent is not an implementation detail buried next to a React component.

The [`xndrjs-toolkit`](https://github.com/xndrjs/toolkit) supplies domain primitives — shapes, validators, proofs, capabilities — so core packages model data the same way across projects. The monorepo is the governance system that decides _where_ those primitives live and _what_ may import them.

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

```ts
// ❌ mutate in place — easy, and unsafe
invoice.status = "paid";

// ✅ named capability — returns a new trusted value
const paid = Invoice.markPaid(invoice);
```

In short: mobility of anemic models, guarantees closer to rich models — without DTOs for every hop and without hoping every method author remembered to validate.

This post will not re-argue the algebra. If you want the full design rationale, start with those two articles. What matters for the monorepo is the consequence: **core stays framework-free and vendor-free**, and operations stay segregated inside it — they do not leak into apps by accident, so business logic is not spread across the delivery layer.

---

## How the template answers the pressures

### Coupling → ports, boundaries, and composition

Core packages cannot import React, Next, or infrastructure SDKs — ESLint `boundaries` and restricted imports make that a merge blocker, not a style preference. Ports are role-oriented (`CmsPort`, not `ContentfulClient`). Apps call public roots from composition (`getBillingRoot(ctx)`); they do not new up infrastructure in a page component.

```ts
// ✅ page/hook calls composition — not vendors
const createInvoiceMutation = useMutation({
  mutationFn: (input) => {
    const { createInvoice } = getBillingRoot(ctx);
    return createInvoice(input);
  },
});

// ❌ orchestration buried in the hook — not portable across runtimes,
//    and tied to a vendor HTTP shape
const createInvoiceMutation = useMutation({
  mutationFn: async (input) => {
    const result = await fetch("https://api.stripe.com/…", {
      method: "POST",
      body: JSON.stringify(input),
    });
    // …map response, handle errors, encode business rules…
    return result.json();
  },
});
```

Same use case, different runtimes: wire it once for the server composition file, once for the client if needed. The orchestration does not live inside a hook that cannot run on the server.

### Disorientation → generators and a stable vocabulary

Plop scaffolds cores, ports, use cases, infrastructure packages, and composition roots with the filenames the lint rules expect (`*.use-case.ts`, `*.port.ts`, `*.composition.ts`, …). Agents get the same generators through an MCP server. The question “where does this go?” has a default answer before anyone invents a `utils` folder.

Creating a new use case is not a matter of inventing filenames or folders:

```bash
pnpm generate core-use-case
```

The generator scaffolds the expected structure:

```text
packages/core-billing/
└── use-cases/
    ├── create-invoice.use-case.ts
    ├── create-invoice.use-case.test.ts
    └── index.ts
```

The filenames are not cosmetic. They match the repository’s architectural rules, so the generated code is immediately discoverable — and enforceable.

Vertical slices and an explicit ban on catch-all cores reduce god packages. Infrastructure splits by vendor first, then by context when reuse appears — so `S3-the-SDK` and `S3-for-this-export-flow` do not have to be the same package forever.

### Folklore → executable architecture

Architecture rules are only useful if they can survive pressure from daily development. A document saying “core must not import infrastructure” is a guideline; a build that fails when someone violates it is a constraint.

Put a forbidden import in a core package and the repository refuses it:

```ts
// packages/core-billing/use-cases/create-invoice.use-case.ts
import { S3Client } from "@infrastructure/s3"; // ❌
```

```text
ESLint error

Core packages must not import infrastructure packages
'@infrastructure/s3' import is restricted from being
used by a pattern (no-restricted-imports)
```

The same applies to frameworks (and to SDKs once they are on the core ban list):

```ts
import { useState } from "react"; // ❌ inside @core
```

```text
ESLint error
Framework and SDK imports are forbidden in core packages.
Depend on ports instead. (no-restricted-imports)
```

That is the difference between documenting Clean Architecture and enforcing it.

The template turns architectural decisions into executable checks:

- **Dependency matrices** define which packages may depend on which others. If a core package imports infrastructure, or a UI package reaches into an internal layer, the violation is caught during development instead of during review — forbidden dependencies become a build failure.
- **Filename conventions** are enforced automatically. If the architecture expects ports to be named `*.port.ts`, use cases `*.use-case.ts`, and adapters to follow predictable patterns, the repository can detect drift before it spreads.
- **Custom ESLint rules** enforce constraints that generic tooling cannot understand. For example, infrastructure packages may be prevented from importing each other unless the dependency is explicitly allowed, avoiding accidental coupling between vendors or technical concerns.

Documentation in `architecture/` remains the human source of truth: it explains the reasoning behind the rules and the trade-offs. ESLint and CI are the machine enforcement layer: they make the agreed boundaries harder to violate accidentally.

Architecture is not only shared knowledge. It is a **verifiable property** of the system.

Reviews still matter: they are where humans discuss design decisions. The goal is not to replace judgment, but to stop making reviewers the only line of defense.

### Huge PRs → seams and a phased feature workflow

Large PRs are often treated as a discipline problem: “keep changes smaller.” But small PRs are a consequence of good boundaries; they are not just a matter of human skill.

The template encourages a phased feature workflow:

- **Map:** understand the existing architecture, dependencies, and affected areas.
- **Spec:** describe the intended behavior and business rules before implementation details exist.
- **Design:** decide how the change fits into the existing boundaries — which core owns it, which models, use-cases and ports are needed, which adapters are involved.
- **Scaffold:** create the structural pieces with generators before filling in the implementation.
- **Implement:** complete each piece inside the boundaries already defined. Implementation is not “write code until it works” — it follows the dependency chain outward, layer by layer:
  - **Models:** define domain shapes and capabilities.
  - **Use cases and ports:** implement application orchestration and declare what the outside world must provide.
  - **Adapters:** connect those ports to concrete technologies and external systems.
  - **Composition root:** wire concrete implementations together.
  - **Application usage:** consume the composed use-cases from controllers, components, or other entry points.

These phases create natural checkpoints for both humans and AI agents. Instead of asking one contributor or one agent run to discover the domain, invent the architecture, create infrastructure, and build the UI at the same time, the work is split into decisions that can be reviewed independently — so architectural choices are not buried among implementation details in a single change. Even inside Implement, an agent can work on models without inventing adapters or composition wiring in the same pass: the problem is decomposed for the cognitive process, not only for the file tree.

Capability-oriented folders reinforce those boundaries. A feature is not spread across a collection of generic technical folders where every change requires touching unrelated areas; the code that evolves together has a natural place to live. That is what makes independent units of work possible: the structure itself creates places where collaboration can stop, review, and resume.

Smaller blast radius is therefore a result of clearer seams. Asking teams to “open smaller PRs” without improving the architecture only moves the problem around: the codebase still forces unrelated concerns into the same change.

In that sense the template is not only Clean Architecture for cleanliness. It is architecture as **collaboration platform**.

### Testing → fake the edge, unit-test the core

The template tries to make the most valuable tests the easiest ones to write.

Use cases depend on abstractions that represent external operations — ports — not on their concrete implementations. That means a use case does not need a real database, HTTP client, CMS SDK, or external service to be tested. Tests provide small in-memory fakes that implement the same port and verify the orchestration logic in isolation.

For example, a use case that creates an invoice does not test Stripe, PostgreSQL, or an HTTP endpoint. It tests that the application coordinates the required operations correctly: validating input, calling the right outbound operations, and handling the result.

Domain capabilities and services follow the same principle. They are pure transformations over trusted data, so they can be tested without a browser, framework runtime, or infrastructure setup.

Infrastructure tests live closer to the edge:

- **mappers** verify that external representations are converted correctly into domain shapes;
- **adapters** verify integration behavior where it is meaningful;
- **loaders** intentionally stay thin and close to their external source — they fetch raw payloads, they do not hide application logic inside data-fetching code. Mapping and port fulfillment live elsewhere (mapper / repository), so “raw” here means: no business rules smuggled into the fetch.

Integration and end-to-end tests belong in `apps`, because that is where the real composition happens: frameworks, dependency injection, routing, and delivery mechanisms come together.

Vitest is split into `node` and `react` projects so the default test environment matches the layer being tested. Core code runs in a lightweight Node environment; UI code gets the browser-like runtime it actually needs.

The result is not “more tests everywhere.” It is a test distribution that follows architectural boundaries: cheap tests around policies, targeted tests at the edges, and full-system tests only where integration is the thing being verified.

### AI → skills, hard stops, and architecture-aware automation

AI assistants are very good at completing local tasks: fixing a type error, generating a component, wiring an API call, making a test pass.

The problem is that local correctness is not the same as architectural correctness.

Without explicit constraints, an assistant will naturally optimize for the shortest path to a working change. That path may introduce a framework dependency into core code, call a vendor SDK directly from a component, bypass an existing port, or place new logic in a convenient but incorrect layer. An agent amplifies the repository’s default: if the default is unclear, it reaches for whatever is most probable in public examples — frameworks, DTOs, hooks, SDKs — whether or not that fits this system.

The template treats AI agents like any other contributor: they need the same architectural context and the same guardrails as humans.

Agent entrypoints (`AGENTS.md`, shared skills across Cursor, Claude, Codex, and other tools) describe the topology of the repository: where features live, which boundaries exist, how new components should be created, and which workflows to follow.

Generators reduce free-form invention. Instead of asking an agent to guess the shape of a new use case, port, or package, the repository provides the expected structure.

```text
You: Create a new invoice use case in @core/billing.

Agent: Running `pnpm generate core-use-case`…
       → create-invoice.use-case.ts
       → create-invoice.use-case.test.ts
```

Lint rules enforce the boundaries that should not depend on memory or attention:

- dependency rules prevent forbidden imports;
- naming conventions keep the generated structure discoverable;
- composition roots remain the explicit place where implementations are wired together.

The assistant still writes code. It just writes inside boundaries the repository already agreed on.

AI does not replace architecture. It increases the value of having one — and of treating that architecture as a shared protocol between humans and agents, not only as a folder layout.

Related reading: [AI doesn't make DDD less important](/blog/ai-makes-domain-driven-design-essential/) and [Parsing-slop](/blog/parsing-slop-a-particular-form-of-ai-slop/).

### Team working → shared vocabulary across products

A monorepo template is not only about organizing code. It also creates a shared way of talking about code.

When every project invents its own architecture vocabulary, the cost appears whenever people move between products. A developer joining a new repository has to rediscover the same concepts again: where business rules live, what an adapter is called, where dependencies are wired, whether a data-access class is a repository or just a client wrapper.

The technical details may be different, but the architectural questions are often the same.

A shared structure reduces that repeated discovery cost. When projects use the same concepts — core, ports, use cases, composition roots, loaders, repositories — a developer who already understands one product can open another and build a useful mental model much faster.

They do not need to learn a completely new architecture every time. They can focus their attention on the part that is actually different: the business domain.

This also improves collaboration. Reviews become more precise because words have a shared meaning. “This dependency belongs behind a port” is no longer a personal preference or a convention that exists only in one repository; it refers to a rule that applies across projects.

The result is not that every application becomes identical. Different products still have different domains, constraints, and decisions. The goal is to standardize the engineering language around those differences, so teams can move faster without constantly renegotiating the basics.

---

## What this is not

It is important to clarify what this template is — and what it is not.

It is not a pre-built SaaS or an example application. There is no storefront, dashboard, or business domain hidden inside it. `apps/` and `packages/` start intentionally empty because the goal is not to give you a product to modify. The goal is to give you a structure in which your own product can grow.

The valuable part is the contract: the boundaries, conventions, generators, and workflows that define how the application is built.

It is also not a replacement for your framework choices. Next.js, React, your CMS, your database, and your external services are still part of the system. The difference is where they live. They belong at the edges, rather than becoming the vocabulary of the whole system.

Finally, it is not “just a folder structure.” A folder layout alone is easy to ignore. Without enforcement, generators, and workflows, architecture quickly becomes documentation that drifts away from reality.

The template is built around a basic idea: **structure + generators + lint + skills** should make the correct architectural choice the easiest choice. The path of least resistance should lead developers — and agents — toward the boundaries the team agreed on.

The responsibilities between the template and the toolkit remain deliberately separate. The toolkit provides domain primitives; the monorepo provides organization and governance.

Together, they close the loop: reusable domain building blocks inside an architecture that makes their use consistent.

---

## Upfront cost, intentional payoff

Adopting this style costs more on day one than a totally custom app that “just ships the page.” You learn a vocabulary. You write ports. You go through generators. You accept that CI will refuse some shortcuts.

That is **strategic programming** in John Ousterhout’s words (_A Philosophy of Software Design_): **invest in designability** instead of optimizing only for the next tactical win.

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

A layout that hides complexity does not remove it. It only postpones the bill — until the **cost of hiding it** becomes obvious.

---

## Where to go next

- Monorepo template: [github.com/xndrjs/monorepo](https://github.com/xndrjs/monorepo)
- Architecture contract in that repo: `architecture/clean-architecture-oriented-monorepo.md`
- Domain primitives: [`@xndrjs/domain`](/v0/domain/overview/) and the [Domain Algebra](/blog/xndrjs-domain-algebra-rich-anemic/) / [Trusted Shape Modeling](/blog/object-oriented-modeling-vs-trusted-shape-modeling/) posts
- Toolkit overview: [Getting started](/v0/getting-started/introduction/)
