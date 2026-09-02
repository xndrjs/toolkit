---
title: "The four pillars of resource graph resolution in a Clean Architecture monorepo"
description: Where resource identities, data sources, graph strategies, and domain mapping belong when resolving complex aggregates across multiple backends.
date: 2026-09-02
author: Fabio Fognani
tags:
  - architecture
  - monorepo
  - clean-architecture
  - cms
  - typescript
---

In the previous post, I started from a deceptively simple problem:

> What happens when a component tree stops being a good place to resolve the data it needs?

For a small application, letting components fetch their own data is often perfectly reasonable.

For a large CMS-driven application, it eventually becomes something else: a distributed graph resolution process hidden inside the rendering tree.

The solution I described was to make that graph explicit and resolve it independently from rendering.

That gives us a generic [resource graph resolver](/blog/every-component-fetches-its-own-data-until-it-cant/): start from a root resource, discover its dependencies, route them to the appropriate data sources, batch what can be batched, and continue until the graph is resolved.

But solving the graph traversal problem raises a second question:

> Where does all the knowledge required to resolve that graph actually belong?

A real application may have:

- Contentful entries and assets;
- product data from an integration API;
- news from another service;
- several locales;
- different batching and concurrency constraints;
- a domain model that looks nothing like any of those APIs.

The resolver can orchestrate the work, but it should not own that knowledge.

Something has to define the resources. Something has to know how to load them. Something has to describe how they relate to one another. And something has to turn the resulting infrastructure graph into the domain aggregate the application actually wants.

Those are four different responsibilities.

The interesting architectural question is therefore not merely what they are, but who owns each one.

---

## From graph traversal to architectural boundaries

Suppose an application needs to resolve a localized page.

At the domain level, it wants something simple:

```text
Page
├── title
├── hero
├── modules
│   ├── editorial content
│   ├── products
│   └── promotions
└── footer
```

But that object may actually be assembled from several systems:

```text
Contentful
├── page
├── modules
└── assets

Product API
├── products
└── prices

News API
└── articles
```

The domain should not have to know any of this.

The UI certainly should not have to know any of this.

But the infrastructure does.

So we need to answer four questions:

1. What are the things in this graph?
2. Who can load each thing?
3. How do things reveal other things?
4. How does the resolved graph become a domain object?

These questions give us the four pillars.

---

## The four pillars

Think of aggregate resolution as four separable decisions.

### 1. Resource identities

What things can participate in the graph?

Resource identities give infrastructure resources a stable, typed address.

An identity might represent a CMS entry, a CMS asset, a product, a news item, or any other resource that can be addressed and resolved.

The payload is the resource itself.

The identity — typically an Application Resource Identifier (ARI) — is how the graph refers to it.

The important distinction is that these are infrastructure resources, not domain objects.

A product API may expose a product by SKU. A CMS may expose an entry by ID and locale. Those identities describe how the infrastructure addresses things.

The domain can later decide that several of those resources together constitute a Product, Page, or some other aggregate.

This keeps infrastructure vocabulary separate from domain vocabulary.

---

### 2. Loaders

How can a resource be loaded from its vendor?

A loader is the vendor-specific mechanism that knows how to communicate with an external system and turn its response into typed infrastructure resources.

It knows things such as:

- how to authenticate with the vendor;
- which API or SDK to call;
- how to encode resource identities into vendor requests;
- how to decode and validate vendor responses;
- how to translate vendor errors into the loader’s contract.

A loader is feature-agnostic.

A Contentful loader should not know whether an entry is being loaded for a page, a product detail view, or an editorial workflow.

It only knows how to load the resource types supported by its vendor integration.

The loader is therefore where vendor protocol knowledge lives.

It does not know why the application needs the resource.

---

### 3. Data sources

Which loader should the resolver use, and under which operational constraints?

A data source adapts one loader to the resource graph resolver.

It declares which resource identities it accepts and configures how those resources should be loaded.

It knows things such as:

- which resource identities it accepts;
- which loader performs the operation;
- how many resources can be loaded in one batch;
- how many batches can run concurrently;
- which retry, timeout, or scheduling options apply.

A data source is vendor-specific and feature-agnostic.

For example, a CMS integration may expose separate data sources for entries and assets because they use different endpoints, response shapes, or operational limits:

```text
Contentful entry data source
Contentful asset data source
```

Both can use vendor-specific loaders, but neither should know whether the resources are needed by a page, a campaign, or another feature.

The resolver does not need to know any of those vendor details.

It simply has a collection of data sources and routes each pending resource to the matching one.

The data source is therefore where loader configuration and vendor-specific transport capability meet the generic resolver.

---

### 4. Graph resolution strategy

Once I have this resource, what do I need next?

This is where the application-specific knowledge of the graph lives.

A strategy must understand both sides of the relationship it is expanding:

- the vendor-specific shape of the resource;
- the feature-specific need to resolve another resource in order to build part of an aggregate.

A CMS module containing a product SKU creates a relationship with a product resource.

A page containing modules creates relationships with those modules.

A module containing an asset creates another relationship.

To define those relationships, the strategy needs to know how the vendor represents fields, links, references, and identifiers.

But it also needs to know why the feature requires those relationships.

The strategy is therefore vendor-specific and feature-specific.

It is not merely a generic description of links in a payload.

It expresses the graph required by a particular feature, using the shapes and references exposed by particular vendors.

The strategy describes the graph topology:

> given this resource, under this context and these conditions, which other resources should be resolved?

This is also where graph-specific caching boundaries can be described through islands.

Expansion and islands are deliberately separate concepts.

Expansion answers:

> What else do I need?

An island answers:

> Which part of this graph should be treated as a coherent unit for caching and lifecycle purposes?

Keeping them separate matters. A resource can participate in several expansion relationships without those relationships having to dictate its cache boundaries.

The resolver owns the traversal mechanism.

The strategy owns the knowledge of why the graph expands and how vendor resources expose those relationships.

---

### 5. Mapping

What does the resolved graph mean to the application?

After the resolver has finished, we have a collection of resolved infrastructure resources.

That is useful, but it is not yet the domain model.

The application does not want:

```text
cms.entry
cms.asset
integration.product
integration.news
```

It wants something like:

```text
Page
├── Hero
├── ProductModule
│   └── Product[]
└── NewsModule
    └── Article[]
```

Mapping is the step that performs that transformation.

A mapper must understand both the vendor-specific resource formats and the feature-specific domain aggregate.

It may need to know how a Contentful entry represents a module, how a product API represents a product, and how those resources together become a ProductModule inside a Page.

Mapping is therefore vendor-specific and feature-specific.

Unlike the generic resolver, it cannot be vendor-agnostic.

Unlike a loader, it cannot be feature-agnostic.

It belongs at the point where the complete aggregate is understood and where infrastructure representations are translated into domain meaning.

---

## Where should these things live?

Once the responsibilities are clear, the package boundaries become much less arbitrary.

The resource graph itself may cross several vendors.

The aggregate, however, belongs to a particular feature or bounded context.

That gives us two different axes:

```text
                    Feature-specific
                           ↑
                           │
              Strategy     │    Mapping
                           │
Vendor-agnostic ───────────┼─────────── Vendor-specific
                           │
              Resources    │    Data sources
                           │
                           ↓
                    Feature-agnostic
```

More concretely:

| Responsibility     | Vendor          | Feature  | Typical home                    |
| ------------------ | --------------- | -------- | ------------------------------- |
| Resource identity  | mostly agnostic | specific | infrastructure resource package |
| Loader             | specific        | agnostic | vendor infrastructure           |
| Data source        | specific        | agnostic | vendor infrastructure           |
| Expansion strategy | specific        | specific | feature repository              |
| Domain mapping     | specific        | specific | feature repository              |

There is an important nuance here.

Expansion strategy is both feature-specific and vendor-specific.

If a Contentful entry has a field containing a product SKU, the strategy must know how that field is represented and how to turn it into the corresponding product resource identity.

At the same time, it must know that the feature needs that product in order to build a particular part of its aggregate.

This knowledge can be authored close to the feature repository, possibly by composing reusable vendor-specific expansion helpers.

The key point is that the aggregate-level strategy has a single home.

The same applies to mapping: it belongs to the feature because it knows the aggregate, and it belongs close to the vendor-shaped resources because it must interpret their formats.

---

## The repository: where the aggregate comes together

This leads to the fourth package in the architecture: the feature-specific repository.

Imagine:

```text
@infrastructure/
  pagebuilder-graph-resolver/
```

Its responsibility is conceptually simple:

> Given the inputs required by the application, resolve the Page aggregate.

It knows:

- which root resource represents a page;
- which expansion strategy builds that page’s graph;
- which data sources are required;
- how the resulting graph maps into the domain aggregate.

So the flow becomes:

```text
Application
     │
     │ "give me Page X"
     ▼
Page Repository
     │
     ├── Strategy
     │
     ├── Data sources
     │
     └── Graph resolver
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
      CMS   Product  News
       │      │      │
       └──────┼──────┘
              ▼
         Resolved graph
              │
              ▼
          Domain Page
```

The repository is therefore not just an arbitrary wrapper around the resolver.

It is the place where the infrastructure graph becomes a specific application capability.

That distinction is important.

The generic resolver should not know what a page is.

The Contentful loader should not know what a page is.

The product loader should not know what a page is.

But something must know how all three contribute to a Page.

That something is the repository.

---

## Why strategy and mapping belong together

There is a useful symmetry here.

The strategy says:

> To build this aggregate, these are the resources I need.

The mapper says:

> Now that I have those resources, this is what they mean.

Both require knowledge of the same feature.

Both must understand the aggregate being built.

Both may need to change when the feature’s content model changes.

Both also need to understand the vendor-specific resource contracts they consume.

That is why I prefer them to live together in the repository package.

This also gives us a useful failure model.

If a CMS resource changes shape, the expansion policy that accesses that field should fail type checking.

If the identity of a resource changes — for example from “product by SKU” to “product by ID” — the corresponding ARI and policies should fail.

If the domain aggregate changes, the mapper should fail.

If the CMS changes while preserving the resource contract, only the vendor-specific loader and, where necessary, the vendor-specific data source configuration should need to change.

If the vendor resource contract changes, the affected strategies and mappers should fail explicitly because they own knowledge of that shape.

Those are exactly the boundaries we want.

---

## Composition is not where the graph is defined

This distinction becomes particularly important in a Clean Architecture monorepo.

A composition root answers:

> Which concrete implementations should run in this application/runtime?

It wires things together.

For example:

```text
production runtime
    │
    ├── authenticated Contentful client
    ├── product API client
    ├── cache
    └── repository implementation
```

But composition should not answer:

> What is a page?

or:

> Which resources does a page require?

or:

> How do those resources map into the domain?

Those are architectural decisions, not runtime wiring.

The composition root chooses instances.

The repository defines aggregate resolution.

That means the strategy and mapper do not need to be reconstructed differently by every application entrypoint, runtime, or deployment.

Composition binds runtime.

The repository owns the feature.

---

## The monorepo makes these boundaries enforceable

This is where a governed monorepo becomes more than a convenient directory structure.

The point is not merely to create folders named domain, application, and infrastructure.

The point is to make the dependency rules mechanically enforceable.

A possible workspace might look roughly like:

```text
packages/
├── domain/
├── application/
│
├── infrastructure/
│   ├── contentful/
│   ├── product-api/
│   ├── pagebuilder-resources/
│   └── pagebuilder-graph-resolver/
│
└── composition/
```

The exact structure is less important than the dependency direction.

The domain must not import Contentful.

The application must not know how Contentful batches requests.

A UI component must not know how to discover the product resources required by a page.

The generic resolver must not know what a page means.

And the composition root must not become the place where all of those concepts are manually orchestrated.

The repository becomes the explicit seam between feature knowledge and infrastructure mechanism.

---

## One request, end to end

Let’s follow a single request.

The delivery layer asks the application for a localized page.

The application invokes its use case.

The use case delegates to the page repository with the root identity and runtime context.

The repository starts the graph resolver with the page strategy and its configured data sources.

The strategy resolves the first wave of dependencies.

The resolver routes those identities to their matching data sources.

The CMS entry data source batches CMS entry resources through its configured loader.

The CMS asset data source batches CMS asset resources through its configured loader.

The product data source batches product resources.

If one backend is slow, the scheduler can allow another lane to continue making progress.

As resources arrive, the strategy discovers further resources.

The resolver continues until the graph is complete.

Islands identify coherent portions of that graph when caching requires different lifecycles.

Finally, the repository maps the resolved infrastructure graph into the domain Page.

Only then does the application hand the aggregate to the delivery layer.

The UI receives:

> a Page

not:

> a Contentful entry, plus some product JSON, plus a list of IDs it still needs to resolve.

The component represents the object.

It does not construct it.

---

## This is what “smart aggregates, dumb components” means

There is a temptation in frontend architecture to push complexity toward the component because it feels local and therefore manageable.

The component knows what it renders, so perhaps it should also know what to fetch.

That works until the component becomes responsible for:

- discovering dependencies;
- coordinating requests;
- deduplicating resources;
- handling different backends;
- understanding vendor-specific limits;
- managing cache boundaries;
- combining transport models;
- reconstructing domain objects.

At that point the component is no longer merely rendering.

It has become an orchestration layer.

The alternative is not to make the component “dumber” by removing useful knowledge.

It is to move the knowledge to a place where it can be explicit, typed, reusable, and governed.

The result is:

> Smart aggregates, dumb components.

A component represents an object.

It should not have to construct the object by reverse-engineering the infrastructure graph.

---

## What happens when things change?

This architecture becomes particularly useful when the system evolves.

### The resource shape changes

A field used by an expansion policy disappears.

The policy should fail at compile time.

The graph contract changed, so the code that depended on it should be forced to acknowledge the change.

### The resource identity changes

Suppose a product used to be addressed by SKU and is now addressed by ID.

That is not merely a payload change.

The identity of the resource changed.

The ARI must change, and anything depending on that identity should be exposed by the type system.

This is a different class of migration and should be visible as such.

### The vendor changes

Suppose the application moves from one CMS to another while preserving the resource contract.

The vendor-specific loader changes.

The rest of the graph can remain intact.

If the new vendor exposes a materially different resource model, the relevant resource, data source, expansion, and mapping contracts will force the necessary changes.

### The domain aggregate changes

Suppose Page changes.

The mapper breaks.

Again, this is exactly where we want the compiler to point us.

The architecture therefore gives us a useful rule:

> Changes should break the code that owns the changed knowledge — not arbitrary consumers downstream.

---

## Why this is different from “just use a repository”

A traditional repository abstraction often hides a relatively simple persistence operation:

> find this entity.

A graph repository is doing something more interesting.

It is the boundary between:

```text
application intent
        ↓
domain aggregate
```

and:

```text
multiple infrastructure resources
        ↓
graph resolution
        ↓
vendor-specific transports
```

The repository therefore becomes the feature-level interpreter of the resource graph.

The generic resolver supplies the mechanism.

The repository supplies the meaning.

That distinction allows the same resolver to work for completely different domains without knowing anything about them.

---

## The four pillars, in one picture

Putting everything together:

```text
                         APPLICATION
                              │
                              ▼
                     ┌─────────────────┐
                     │   Repository    │
                     │                 │
                     │ Strategy        │
                     │       +         │
                     │ Mapping         │
                     └────────┬────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ Graph Resolver  │
                     │                 │
                     │ traversal       │
                     │ routing         │
                     │ batching        │
                     │ scheduling      │
                     └────────┬────────┘
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
             DataSource   DataSource   DataSource
                 │            │            │
                 ▼            ▼            ▼
              Loader       Loader       Loader
                 │            │            │
                 ▼            ▼            ▼
               CMS        Product API    News API

Resource identities ─────── vocabulary of the graph
Loaders ─────────────────── vendor protocols
Data sources ────────────── loader configuration and transport capability
Expansion strategy ──────── feature graph topology over vendor resources
Mapping ─────────────────── vendor resources into domain meaning
```

Each layer answers a different question.

And that is the real architectural value.

---

## The important separation

The resource graph resolver does not try to own all four pillars.

It only provides the generic mechanism for walking and resolving the graph.

The infrastructure defines how resources are addressed and loaded.

The vendor integrations define how external APIs are called and configured as data sources.

The feature defines how those resources relate to one another and which relationships are required by the aggregate.

The repository defines how the resolved graph becomes an aggregate.

The application consumes that aggregate.

The framework renders it.

This gives us a clean dependency direction:

```text
Vendor loaders
    ↓
Vendor data sources
    ↓
Infrastructure resources
    ↓
Feature expansion strategy
    ↓
Graph resolution
    ↓
Feature mapping
    ↓
Domain aggregate
    ↓
Application
    ↓
Framework
```

The framework is at the end of the chain, not at the center of it.

That distinction becomes increasingly important as the frontend itself starts taking on more orchestration responsibility.

---

## The bigger lesson

The interesting thing about resource graph resolution is not really the resolver.

The resolver is a mechanism.

The more important architectural decision is to recognize that resource identity, vendor protocols, loader configuration, graph topology, and domain meaning are different kinds of knowledge.

Once those kinds of knowledge are separated, the monorepo stops being a collection of packages and becomes a map of responsibilities.

A CMS adapter can change without teaching React about Contentful.

A product API can change without teaching the application how to batch HTTP requests.

A page aggregate can change without rewriting the graph traversal algorithm.

And a new runtime can compose the same feature without redefining how that feature is resolved.

That is what a governed architecture should buy us:

not fewer abstractions, but fewer places where unrelated knowledge can become entangled.

The graph is explicit.

The transports are replaceable.

The aggregate is meaningful.

And the component can finally do the thing it was supposed to do in the first place:

represent the object, rather than construct it.

---

## Further reading

- [Every component fetches its own data, until it can't](/blog/every-component-fetches-its-own-data-until-it-cant/) — the resolution problem and the generic graph resolver
- [Resource graph resolver](/v0/infrastructure/resource-graph-resolver/) — API and scheduling reference
- [From Query Keys to Application Resource Identifiers](/blog/from-query-keys-to-application-resource-identifiers/) — why infrastructure identities exist
- [A Clean Architecture monorepo template](/blog/clean-architecture-monorepo-template/) — workspace governance and dependency boundaries
- [Contentful to Zod](/v0/infrastructure/contentful-to-zod/) — transport schemas and generated link metadata
- [xndrjs monorepo](https://github.com/xndrjs/monorepo) — the production-shaped workspace template
