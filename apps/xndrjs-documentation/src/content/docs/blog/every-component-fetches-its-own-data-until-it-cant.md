---
title: "Every component fetches its own data, until it can't"
description: Why large CMS-driven sites with deep pages, dozens of locales, and integration layers need a content resolution engine, not "smarter React components".
date: 2026-08-23
author: Fabio Fognani
tags:
  - architecture
  - cms
  - typescript
  - nextjs
  - graphql
  - cache
---

Over the last three years I had the chance to work on two large institutional websites.

Different brands, different teams, similar architecture:

- a headless CMS, in both cases Contentful;
- an integration layer for things such as product data, commercial information, and news;
- pages assembled from CMS modules — hero, carousel, tabs, product strips, and so on;
- content localized across roughly thirty locales.

The idea behind the first "pagebuilder" I designed was naive:

> **Let each component load the data it needs.**

A page loads its modules. A module loads its children. A product module loads its product data. React renders everything as it becomes available.

It's simple. It's also the quickest way to discover that the hard part of these sites is **resource graph resolution**. Rendering is only what happens after.

That realization is why I built [`@xndrjs/resource-graph-resolver`](/v0/infrastructure/resource-graph-resolver/).

This article explains the problem first, the approaches that look reasonable but stop scaling, and the architectural model I ended up with.

The goal is not to explain every implementation detail of the library. It is to explain the idea well enough that you can recognize the problem in your own system — and understand what the resolver is actually giving you.

---

## A page is not just a tree of components

Consider a page like this:

```text
Home
├── Hero
├── Tabs
│   ├── Product Strip
│   │   ├── Product A
│   │   └── Product B
│   └── Editorial Promo
├── Carousel
└── Footer
```

At the UI level, this looks like a component tree. At the data level, it is a **graph**.

- the page references modules.
- modules reference other modules.
- some modules reference assets.
- some reference products whose data lives outside the CMS.
- some resources are shared by several branches.

And all of them may have to be resolved for a particular locale and execution context.

That graph can easily become much larger than the visible component tree suggests.

This is the important shift:

> **The UI is a representation of the resolved graph. It is not necessarily the right place to discover and resolve that graph.**

Once you see the problem this way, several common solutions start to look less attractive.

---

## The obvious solution: let components fetch

Suppose a Next.js application uses Server Components.

The route resolves a `pageId` and loads the page modules.

Then each module takes care of itself:

```tsx
<Hero />
<Tabs />
<Carousel />
```

The `Tabs` component loads its children. A product strip loads its products. A product loads additional information from an integration API.

This is attractive because the code follows the UI structure: every component is independently understandable, fetching and rendering are co-located, life is easy.

For a small site, this can be the right solution.

The problem appears when the graph gets large.

---

### Problem #1: N+1 becomes a graph problem

Imagine a page with twenty modules. Some modules contain more modules, some of those modules reference assets. Some other reference products.

A component-local fetching strategy can turn that into dozens or hundreds of requests.

Worse, the same resource may be encountered more than once.

Imagine the same item found in a "related products" section, in two different branches:

```text
Tab A ──> Product Strip ──> Product 123
Tab B ──> Product Strip ──> Product 123
```

Without global coordination, `Product 123` will be requested twice.

Caching individual requests can reduce the damage, but it does not change the fundamental problem: **the code that knows how to resolve the graph is spread across the rendering tree.**

The system cannot easily see the **complete set of resources** that needs to be resolved.

And that makes batching difficult.

---

### Problem #2: fetching and rendering happen in waves

There is another, less obvious problem.

When fetching happens while the tree renders, fetching and rendering become interleaved:

```text
render
  ↓
fetch
  ↓
render more
  ↓
discover more resources
  ↓
fetch again
  ↓
render more
  ↓
discover more resources
```

This matters because batching works best when resource discovery is centralized rather than distributed across branches that have no way to coordinate with each other.

If each branch independently discovers the resources it needs, there is no shared view of the work still to be done. A resource discovered by one branch cannot naturally be batched with resources discovered by another branch, once that branch has already triggered its request.

A simplified version looks like this:

```text
Render
  │
  ├── discover A ──┐
  ├── discover B ──┤──> CMS batch
  │                │
  │                └──> response
  │
  ├── render A
  │
  └── discover C ─────> another CMS request
```

DataLoader, `Promise.all`, and HTTP caching are all good tools. The difficulty is **where the scheduling decision is being made**: each of them can only batch what the current branch has already asked for.

If discovery is scattered through rendering, the system has very little opportunity to orchestrate the whole graph.

So perhaps... should we move the whole thing into GraphQL? 🤔

---

## "Just use GraphQL"

GraphQL seems almost purpose-built for this problem.

Instead of letting components fetch recursively, describe the whole page as one query:

```graphql
page {
  modules {
    ... on HeroModule {
      ...
    }

    ... on TabsModule {
      ...
    }

    ... on ProductStripModule {
      ...
    }
  }
}
```

One request. Nested data. No N+1 from the React tree. A nicely shaped response.

And for many applications, this is an excellent solution.

But there is an important difference between:

> **GraphQL can represent a graph**

and:

> **one GraphQL query can resolve the ENTIRE content graph**

Those are not the same thing.

---

### When the content model becomes highly polymorphic

A long-lived CMS can easily accumulate hundreds of content types.

Now imagine that a `Tabs` entry can contain arbitrary modules.

The GraphQL query has to describe the possible types:

```graphql
... on HeroModule { ... }
... on CarouselModule { ... }
... on ProductStripModule { ... }
... on PromoModule { ... }
... on EditorialTextModule { ... }
```

The query is no longer describing _this page_, it is describing the **entire set of things the page composer could theoretically contain**.

At that point you have three unpleasant options.

#### One giant query

Put every possible fragment in one operation.

The query grows with the entire polymorphic surface of the CMS rather than with the actual page.

Query size and Contentful's complexity limits become hard constraints very soon. Not feasible.

#### One query per content-type family

Split the query into smaller operations, batching per content-type. For example:

```graphql
query HeroesById($ids: [String!]!) {
  heroModuleCollection(where: { sys: { id_in: $ids } }) {
    items {
      sys {
        id
      }
      title
      image {
        url
      }
    }
  }
}
```

Repeat for all content-types.

Now you have traded query complexity for HTTP round-trips.

The number of operations grows with the number of content types you need to support. It's not uncommon for a single page to have 20-30 distinct content-types: and it's already a pain.

#### Build queries dynamically

_"I know!"_ - says the senior dev - _"I'll compose a dynamic GraphQL query"_.

First you fetch the page skeleton (ids and content-types of the linked modules). Then, at runtime, you generate a GraphQL document that includes **only** the `... on Type` fragments for types that actually appear on that page — not the whole polymorphic catalogue.

This is better.

But now your application is implementing a runtime query planner.

And when a generated query becomes too complex, you may need to split it again, retry, and potentially issue several requests for the same page.

At that point you realize that the interesting problem is no longer:

> "How do I write a better GraphQL query?"

It is:

> **"How do I resolve this graph efficiently?"**

Which is a different matter. The problem is not GraphQL: it can still be part of the infrastructure. It just doesn't need to define the architecture of the **whole** resolution process.

---

## Then let's cache everything

Another natural reaction is to put a cache in front of the CMS: maybe Redis, or framework caching (i.e. Next.js built-in `fetch` cache).

The problem is that there are two very different things you can cache. You can cache **resources**. Or you can cache the **resolved graph**.

Caching individual CMS responses can be useful, but it does not give you a coherent page-level unit.

A page might depend on:

```text
Page
 ├── Module A
 ├── Module B
 │    └── Asset X
 ├── Module C
 │    └── Product 123
 └── Footer
```

An editorial change to `Module B` can affect several pages.

A change to `Product 123` may affect hundreds.

Now ask:

> **What exactly do I invalidate?**

If the cache consists of arbitrary HTTP requests made by arbitrary components, there is no obvious answer. We lack context.

You either try to reconstruct the dependency graph after the fact, or invalidate aggressively. Neither is particularly pleasant.

---

### The other extreme: build a "second CMS"

You can also copy the CMS into Redis:

```text
CMS
 ↓
Redis mirror
 ↓
Application
```

Now page rendering is fast, in theory. But your application has acquired another problem: **it now has to reproduce CMS semantics.**

- linked entries
- locale selection
- filtering
- batch loading
- freshness
- invalidation
- preview vs delivery

Eventually you are no longer using Redis as a cache, you are operating a second CMS.

That is not what I wanted: the CMS should remain the source of truth. The application should still be able to query it.

The cache should accelerate resolution, not replace the system that owns the content model.

---

## So what is the actual problem?

At this point the requirements become clearer.

We need something that can:

- start from a "root" resource and discover the resources it references
- resolve resources from multiple backends
- avoid resolving the same resource repeatedly
- respect backend-specific limits (i.e. rate limits and batch limits)
- support arbitrarily deep graphs
- keep CMS and integration details out of the domain
- produce something that can be cached and invalidated as a coherent unit (or a small set of coherent units)
- run without React or Next.js

In other words:

> **we need a dedicated part of the system for resolving resource graphs.**

Not a smarter UI component. Not a larger GraphQL query. Not a second CMS.

A **graph resolution engine**.

That is the problem [`@xndrjs/resource-graph-resolver`](/v0/infrastructure/resource-graph-resolver/) is designed to solve.

---

## The architectural separation

The important part is not the algorithm itself: it is the boundary.

I want three distinct responsibilities:

```text
             ┌─────────────────────┐
             │     Application     │
             │                     │
             │ "Give me this Page" │
             └──────────┬──────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │   Domain mapping    │
             │                     │
             │  Page ← ContentMap  │
             └──────────┬──────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │  Graph resolution   │
             │                     │
             │    walk + expand    │
             └──────────┬──────────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
        ┌───────────┐       ┌─────────────┐
        │  Content  │       │ Integration │
        │    CMS    │       │     API     │
        └───────────┘       └─────────────┘
```

Application and Domain should not care whether the page came from Contentful and product information came from a commercial API.

And React should certainly not have to know how infrastructure calls are orchestrated to resolve that graph.

The resolver sits in infrastructure because **the split between those external systems is an infrastructure concern**.

The application only needs a port that can provide the aggregate it needs.

---

## A resource needs an identity

The graph needs a common language. That is where [Application Resource Identifiers](/v0/application/application-resources/) come in.

An ARI identifies one addressable resource.

For example:

```text
"cms.entry":[{"id":"page-123","locale":"en-GB"}]
"cms.asset":[{"id":"asset-456","locale":"en-GB"}]
"integration.product":[{"locale":"en-GB","sku":"SKU-789"}]
```

The important thing is that the resolver does not need to understand what those resources _mean_.

It only needs to know:

> "This is a resource I can ask an adapter to resolve."

This gives us a useful separation.

Infrastructure can speak in infrastructure resources:

```text
cms.entry
cms.asset
integration.product
integration.news
```

while the application can speak in application/domain resources:

```text
Page
ProductListing
Article
```

The lower layer knows where things live, the higher layer does not have to.

That distinction is important because an infrastructure boundary is allowed to know that a product currently comes from an integration API.

The domain should not have to know that.

---

## Resolving the graph

The resolver can now work with a very simple model.

Start with a root resource:

```text
Page 123
```

Load it.

Inspect what it references.

Discover more resources:

```text
Page 123
 ├── Hero 456
 ├── Tabs 789
 └── Footer 321
```

Load those.

Inspect them.

Discover more:

```text
Tabs 789
 ├── Product Strip 111
 └── Promo 222

Product Strip 111
 ├── Product A
 └── Product B
```

Continue until there is nothing left to resolve.

Conceptually:

```text
          root
            │
            ▼
         frontier
            │
            ▼
          load
            │
            ▼
        resolved
            │
            ▼
         expand
            │
            └──────> new resources
                         │
                         ▼
                      frontier
```

This is the central algorithm. The engine doesn't need to know what a "product strip" is, it doesn't need to know what Contentful is, it doesn't need to know what an SKU means.

It only needs two capabilities:

1. **load resources**
2. **discover more resources from resolved resources**

This may sound like exactly what a React component was already doing.

The difference is where the responsibility lives and what the resolver knows about the work still to be done.

In React, resource discovery is interleaved with rendering: a component renders, discovers what it needs, performs an infrastructure call, waits for it, and only then can more of the graph become visible.

Here, the graph is resolved independently of rendering. The resolver has a shared view of the resources still to be resolved, so discovery and loading can be orchestrated across the whole graph rather than being fragmented across rendering branches.

It is also framework-agnostic. The same resolution can run from a Next.js request, a backend job, a CLI, a migration script or any other consumer.

And perhaps most importantly, expansion is not expressed as imperative fetching:

```ts
fetch(productUrl);
```

It is expressed declaratively:

```ts
return [integrationProductAri({ sku })];
```

The policy is not saying **how** to fetch the product. It is saying which resource this node requires next.

The resolver takes care of the rest: scheduling the work, handing each source the resources it owns, loading them, and expanding the newly resolved nodes.

That distinction is what turns a collection of component-level fetches into a resource resolution process.

---

## Expansion is where product knowledge lives

The engine itself must not contain rules such as:

> "When the content type is `ProductStrip`, read the SKU field."

That would turn a generic graph walker into a product-specific piece of code.

Instead, a **graph resolution strategy** is provided. **Expansion** rules describe how the graph grows: for each resolved node they name the resource identities that must appear next — no imperative fetching, only declarations the engine can schedule. **Island** rules are optional; they mark where the walk should carve the graph into smaller, self-contained slices — useful when you want cache boundaries without baking invalidation into the resolver itself.

Conceptually:

```typescript
expand(resource, payload) => [
  resourcesToResolve
]
```

A policy depends on exactly three inputs:

- the **current resource identifier**;
- the **current resource payload**;
- an **execution context** you define — locale, A/B variant, user role, preview mode.

And, just as importantly, on nothing else. A policy must not inspect sibling nodes, read the `ContentMap` while it is being built, or depend on which peers happened to land in the same batch.

That restriction is what keeps discovery **deterministic**: changing a source's batch size must never change the edges a policy emits for a given node. When a rule genuinely needs to compare several resolved nodes with each other, it is **business logic** rather than expansion, and it belongs outside a single resolution run — applied to the resolved graph, not to the walk that produces it.

For a CMS entry, a policy might discover linked entries:

```text
CMS entry
   │
   ├── linked entry → cms.entry
   └── linked asset → cms.asset
```

For a product module, another policy might discover an external product:

```text
CMS product module
   │
   └── SKU → integration.product
```

The engine doesn't care why the resource was discovered.

It only puts the new ARI on the frontier.

This is one of the most important properties of the design:

> **The engine owns graph traversal. The product owns graph semantics.**

---

## The graph is resolved in infrastructure, not in React

This gives us a very different rendering architecture.

Instead of:

```text
React
 └── Component
      └── fetch
           └── Component
                └── fetch
```

we have:

```text
Use case
   │
   ▼
Resolution port
   │
   ▼
Graph resolver
   │
   ├── CMS
   ├── Integration API
   └── other sources
   │
   ▼
ContentMap
   │
   ▼
Domain aggregate
   │
   ▼
React
```

By the time React sees the page, the interesting work is already finished.

A component can therefore be boring:

```tsx
<Page page={page} />
```

That is a feature.

The UI should render the result of the application logic.

It shouldn't have to discover what the application logic needs.

---

## One graph, multiple backends

The next problem is that a graph rarely belongs to one backend.

A single page might require:

```text
Contentful
    ├── page
    ├── modules
    └── assets

Integration API
    ├── products
    └── prices
```

The resolver therefore works against a common data-resolution boundary: a **source**. Each source declares which resources it owns and how to load them.

Conceptually:

```text
                    Graph Resolver
                          │
                 current frontier
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
        Contentful source       Integration source
             │                         │
             ▼                         ▼
          CMS batch                Product batch
```

Concretely, a source is a small declaration: the ARI types its transport channel handles, the batch limit its backend imposes, how many requests that backend tolerates in parallel, and a function that loads one batch.

```typescript
const defineSource = defineDataSourceFor<AppContentRegistry, ExecutionContext>();

const cmsSource = defineSource({
  id: "cms",
  for: [cmsEntryAri, cmsAssetAri],
  batchSize: 100,
  async load(batch, { signal }) {
    return contentfulDelivery.fetchBatch(batch, { signal });
  },
});

const productSource = defineSource({
  id: "products",
  for: [integrationProductAri],
  batchSize: 1,
  concurrency: 4,
  load: (batch, { signal }) => fetchProducts(batch, signal),
});
```

Composing two (or more) backends is then just listing them as data sources on a resolver:

```typescript
const resolver = createResourceGraphResolver({
  sources: [cmsSource, productSource],
  strategy: pageStrategy,
});
```

Note what each side owns. The CMS accepts a hundred ids in one `sys.id[in]` call; the product API accepts one SKU per call but tolerates four calls at a time. Neither of those facts is known to the resolver — they are declared by the source that has to live with them, in the units its vendor documentation uses.

What the resolver does with those declarations is route each pending ARI to the source that owns it, cut the pending set into batches no larger than the declared size, and keep no more than the declared number of requests open per backend. What a source does inside `load` — one HTTP request, three, a GraphQL operation, a database query — stays entirely its own business.

This is what allows infrastructure to change without rewriting the graph algorithm. Adding a third backend is adding a third element to an array.

---

## Batching is a scheduling problem

This separation also gives us a better place to solve batching.

Suppose the frontier contains:

```text
"cms.entry":[{"id":"A","locale":"en-GB"}]
"cms.entry":[{"id":"B","locale":"en-GB"}]
"cms.asset":[{"id":"C","locale":"en-GB"}]
"integration.product":[{"locale":"en-GB","sku":"X"}]
"integration.product":[{"locale":"en-GB","sku":"Y"}]
```

The CMS source receives the CMS resources:

```text
"cms.entry":[{"id":"A","locale":"en-GB"}]
"cms.entry":[{"id":"B","locale":"en-GB"}]
"cms.asset":[{"id":"C","locale":"en-GB"}]
```

and issues one suitable request.

The integration source independently receives:

```text
"integration.product":[{"locale":"en-GB","sku":"X"}]
"integration.product":[{"locale":"en-GB","sku":"Y"}]
```

and issues its own batch.

The resolver doesn't need to know whether those became:

- one HTTP request;
- three requests;
- a GraphQL operation;
- REST calls;
- database queries;
- or something else entirely.

That is deliberately hidden behind the source.

It is worth being precise about who decides what here, because it is easy to get backwards. My first version let each adapter reach into the pending set and pull out whatever it wanted, which sounds like maximum flexibility. In practice every adapter re-implemented the same two loops — filter the resources I own, slice off as many as my vendor allows — and each one had its own opportunity to get that wrong.

Batch size is not really a decision. It is a **fact about a backend**: Contentful accepts a hundred ids per call, the product API accepts one. Facts should be declared once, not re-derived by imperative code on every round. So a source states its limits, and the resolver — which is the only party that can see the whole pending set anyway — does the filtering, the slicing and the throttling.

That keeps vendor-specific limits where they belong, and keeps the scheduling logic in the one place that has the information to schedule.

---

## Different scheduling strategies

There is another useful consequence of this separation.

Not every backend behaves the same way.

If CMS and integration requests have similar latency, a **barrier-style walk** is simple and predictable:

```text
CMS ──────────┐
              ├──> expand next wave
API ──────────┘
```

The resolver waits for the current wave to finish before expanding the next one.

But imagine the CMS is fast and the integration API is slow:

```text
CMS:         ─────
Integration: ───────────────────
```

Waiting for the slow backend before allowing the fast backend to make progress may waste time.

A **lane-style walk** can instead let each backend progress independently:

```text
CMS lane:          ────┐────┐────┐
                       │    │    │
                       r1   r2   r3
Integration lane: ────────────────┐
                                  │
                                  r1
```

The graph semantics remain the same. Only the scheduling strategy changes.

This is what the determinism rule above buys us: since no policy can observe siblings or batch composition, both strategies are obliged to produce the same graph, and scheduling stays an implementation choice instead of leaking into the graph resolution strategy or domain code.

The library provides both strategies, and the application chooses the one appropriate for its infrastructure. Because the sources, the policies and the graph semantics are identical either way, the choice is a single field:

```typescript
schedulingMode: "lane"; // or "barrier"
```

That is a deliberately small knob. If switching schedulers required rewiring the backends, the two strategies would not really be interchangeable, and the determinism rule above would be doing no work.

---

## From infrastructure graph to domain aggregate

The resolver doesn't exist to give your UI a giant `ContentMap`.

The `ContentMap` is an intermediate representation of the resolved infrastructure graph. It is still expressed in terms of infrastructure resources and payloads — CMS entries, assets, integration responses, and their resource identifiers.

Its job is to give us all the resolved infrastructure resources in one place:

```text
ContentMap

"cms.entry":[{"id":"page-123","locale":"en-GB"}]
"cms.asset":[{"id":"asset-456","locale":"en-GB"}]
"integration.product":[{"locale":"en-GB","sku":"SKU-789"}]
"integration.news":[{"id":"news-123","locale":"en-GB"}]
```

Now we must map that into the model the application actually wants.

For example:

```typescript
type Page = {
  title: string;
  modules: Module[];
};

type ProductModule = {
  products: Product[];
};
```

The mapper can combine:

```text
CMS product module
        +
integration product data
        ↓
     Product
```

without performing any HTTP requests. This is a crucial boundary.

**Resolution** answers this question:

> What resources do I need, and how do I obtain them?

while **Domain mapping** answers this question:

> What does all this data mean to my application?

Those are different problems.

Keeping them separate prevents infrastructure shapes from leaking into the domain.

---

## Why not orchestrate all of this in the use case?

This is a tempting alternative.

The use case could call:

```text
CMS → get page
CMS → get modules
Integration → get products
CMS → get assets
```

But then the application layer has learned how the product is physically assembled.

What happens when:

- the CMS changes;
- products move into the CMS;
- news moves into another service;
- a new integration is introduced;
- another consumer needs the same graph?

The use case starts accumulating infrastructure knowledge. That is exactly what we are trying to avoid.

The application should ask for the thing it needs, while the infrastructure should determine how that thing is assembled from external systems.

This is the same architectural instinct behind the rest of `xndrjs`:

> **Depend on stable concepts at the boundary, and defer infrastructure decisions to the edge.**

---

## What happens when the infrastructure changes?

Imagine that news currently lives in Contentful:

```text
"cms.entry":[{"id":"news-123","locale":"en-GB"}]
```

Six months later, the organization moves news into an internal API:

```text
"integration.news":[{"id":"news-123","locale":"en-GB"}]
```

With a "component-driven" architecture, this kind of migration tends to spread through the codebase.

With the resolver architecture, the graph semantics can change at the infrastructure boundary.

The engine, the scheduler, and the domain aggregate are all unaffected. Only the **resource identifiers** and **graph resolution strategy** involved in that specific branch need to change.

That is the real value of the abstraction, and it is measured in **knowledge that stays behind a boundary** rather than in lines of code saved.

---

## Contentful and generated expansion metadata

This is where [`contentful-to-zod`](/v0/infrastructure/contentful-to-zod/) becomes particularly useful if you're using Contentful REST API (Delivery).

A large CMS integration has another problem:

> If the CMS has 200+ content types, who maintains the knowledge of which fields contain links?

That information should not be manually duplicated in the resolver.

`contentful-to-zod` generates schemas for the Contentful content types and also exposes the metadata needed to discover linked resources.

The resulting infrastructure code can therefore follow a generic pattern:

```typescript
const entry = parseEntry(payload);

const linkedResources = discoverLinks(entry);

return linkedResources;
```

The resolver doesn't need to know what fields Contentful uses: it simply receives the resulting ARIs.

Cross-source rules can then be added where necessary, for example:

```text
Product entry
     │
     └── SKU
          │
          ▼
integration.product
```

The important thing is that these rules remain **small policies around the generic walker**.

The engine doesn't become a giant registry of CMS content types.

---

## Caching the graph instead of guessing at requests

Once the graph is explicit, caching becomes much more interesting.

We can talk about the page as a set of resources and dependencies instead of a pile of unrelated HTTP requests.

This is where the resolver's **islands** concept becomes useful. An island identifies a coherent slice of the graph.

For example:

```text
Page
├── Header       ← island
├── Main content
└── Footer       ← island
```

The cache can therefore treat those slices differently.

The menu might be shared across hundreds of pages and have a longer lifetime.

The main page content might be much more volatile.

The footer might have its own invalidation rules.

The resolver does not decide when anything becomes stale.

That's deliberate.

Invalidation policy belongs to the cache/infrastructure layer.

The resolver simply gives the cache a meaningful dependency structure to work with.

This is very different from trying to infer page dependencies from arbitrary component-level fetches.

### The library will not resolve conflicts for you

There is one decision the resolver deliberately refuses to make on your behalf.

When you rebuild a starting point from several cached islands, the same ARI can appear in more than one slice — a shared logo asset belonging to both the menu island and the footer island, for example. Those two cached copies were written at different times, so they may disagree.

The library does not pick a winner. Reconstituting backing resources requires a conflict callback:

```typescript
buildBackingResourcesFromIslands(cachedIslands, {
  policy: "only-complete",
  onResourceConflict: (conflict) => {
    // keep one of the two payloads (conflict.existing / conflict.incoming),
    // return null to drop the key and let the engine re-resolve it,
    // or throw to reject the whole reconstruction
    return conflict.incoming;
  },
});
```

Which of those is correct depends on what the payload means, how stale each island is, and how much the difference matters to the page — precisely the knowledge the resolver does not have and should not guess.

---

## The resolver does not become your cache

There is an important distinction here.

The resolver can produce a resolved graph that **can** be cached as a coherent unit.

It does not require you to cache everything, and it certainly does not make assumptions on how you will cache/invalidate.

You can use:

- HTTP caching
- Redis
- database-backed snapshots
- no cache at all

The architecture remains the same. The cache is an optimization around resolution.

---

## What the library actually gives you

At this point, the implementation details should be easier to understand.

`@xndrjs/resource-graph-resolver` gives you a generic mechanism for:

1. starting from a root resource;
2. loading unresolved resources;
3. discovering additional resources;
4. deduplicating the graph;
5. coordinating multiple sources, including their batch limits and parallelism;
6. controlling how the graph progresses;
7. materializing the result as a `ContentMap`.

The library does **not** decide:

- what a page is
- what a product is
- which CMS you use
- which API provides product information
- how your domain models look
- how your cache should be invalidated
- how React should render the result

Those decisions belong to the application. This is intentional: a generic library should abstract the **mechanism**, not pretend to know the **business** or make assumptions on the **infrastructure**.

---

## A minimal mental model

Think about four things:

### 1. Resources

What things can the application address?

```text
Page
CMS entry
Asset
Product
News item
```

Give them stable unique identifiers.

### 2. Sources

Who knows how to retrieve each resource, and under which limits?

```text
CMS source
Product API source
News source
```

### 3. Graph resolution strategy

Once I have this resource, what other resources does it reference — and which slices should become islands?

```text
Page → modules          (expansion)
Menu → island boundary  (islands)
Module → assets         (expansion)
Product module → product (expansion)
```

### 4. Mapping

Once everything is resolved, how does it become the model my application actually uses?

```text
Page ← ContentMap
```

That's the whole architecture, the rest is optimization.

---

## The bigger architectural lesson

Contentful, GraphQL, and Next.js are incidental here — and so, in the end, are CMS-driven websites.

The same pattern appears whenever an application starts with one resource and discovers more resources recursively across multiple systems.

At small scale, local fetching is often perfectly reasonable.

At larger scale, the system needs to know:

> **What does this resource depend on, and how can I resolve those dependencies efficiently?**

Once that becomes the dominant question, the graph deserves to become an explicit architectural concept.

That is the point where a resolution engine starts making sense.

---

## Where this fits in `xndrjs`

This is also why the resource graph resolver is not an isolated utility in the toolkit.

It fits into a broader architectural model.

[Application Resource Identifiers](/v0/application/application-resources/) provide stable identities for resources.

[`contentful-to-zod`](/v0/infrastructure/contentful-to-zod/) provides trustworthy transport parsing and generated link metadata, if you're using Contentful.

[`@xndrjs/resource-graph-resolver`](/v0/infrastructure/resource-graph-resolver/) provides the infrastructure-level graph traversal.

The application maps the resulting infrastructure graph into domain aggregates.

The framework consumes those aggregates.

In other words:

```text
Transport
   ↓
Infrastructure resources
   ↓
Graph resolution
   ↓
Domain aggregate
   ↓
Application
   ↓
Framework
```

The dependency direction matters.

The application should not be forced to understand the infrastructure simply because the infrastructure happens to be complicated.

---

## The lesson

Deep CMS pages across dozens of locales are not primarily a rendering problem.

They are a **resource resolution problem**.

The moment your content graph becomes deep, polymorphic, cross-source, and expensive to resolve, the question stops being:

> "Which component should fetch this?"

and becomes:

> **"How should the application resolve this graph?"**

You can solve that problem with a growing collection of component-level caches, increasingly clever GraphQL queries, framework-specific loading conventions, and eventually a substantial amount of glue code.

Or...

You can make the graph explicit, give resources stable identities, separate graph discovery from loading. You can let each backend decide how to batch its own work, and resolve the whole graph before rendering. Then map the result into a domain aggregate that your application can easily reason about.

That's what [`@xndrjs/resource-graph-resolver`](/v0/infrastructure/resource-graph-resolver/) is for.

The [demo application](https://github.com/xndrjs/toolkit/tree/main/apps/resource-graph-resolver-demo) shows one possible wiring using Contentful-shaped fixtures, an integration catalog, two sources with deliberately opposite batching shapes, a graph resolution strategy, and a Next.js consumer.

It is intentionally small, as it is a workshop for the resolution model, not a production architecture.

For a real application, the same idea belongs inside explicit infrastructure boundaries — ports, adapters, composition roots, and the rest of the architectural discipline described in the [Clean Architecture monorepo template](/blog/clean-architecture-monorepo-template/).

Smarter components would not have solved this. What solved it was treating resolution as a dedicated concern, handled independently from rendering, so that obtaining the resources an application needs stops being a puzzle spread across the UI.

That separation is the real goal. The application defines what it needs; infrastructure deals with how external systems must be orchestrated to provide it.

Infrastructure should serve the application, not the other way around.

---

## Further reading

- [Resource graph resolver (docs)](/v0/infrastructure/resource-graph-resolver/)
- [Application resources](/v0/application/application-resources/)
- [Contentful to Zod](/v0/infrastructure/contentful-to-zod/)
- [We're Not "Frontend Developers" Anymore](/blog/were-not-frontend-developers-anymore/)
