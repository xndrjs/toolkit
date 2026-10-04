---
title: "When a resource graph needs a language"
description: How testing a graph resolver against a large CMS-driven aggregate exposes the glue code left behind by a well-structured architecture—and why that pressure leads to Ziel.
date: 2026-10-03
author: Fabio Fognani
tags:
  - typescript
  - dsl
  - resource-graph-resolution
  - ziel
---

This is the third article in a series about resource graph resolution.

In [the first article](/blog/every-component-fetches-its-own-data-until-it-cant/), I start from the naive idea that every component should load its own data. That works well until a large CMS-driven page starts discovering resources recursively across a CMS, an integration layer, or other backends. At that point the component tree quietly becomes responsible for a distributed orchestration process. Making the resource graph explicit lets the application resolve it before rendering, batch and deduplicate work across the whole graph, and give the UI an aggregate it can simply represent.

In [the second article](/blog/five-elements-of-resource-graph-resolution-in-a-clean-architecture-monorepo/), I look at where the code required by that process should live. Resource identities, vendor loaders, data sources, graph resolution strategies, and mapping do not carry the same kind of knowledge, so they should not all collapse into the same place. Separating those responsibilities gives each decision an explicit owner.

To see how it holds up, I tested that architecture against the page-rendering requirements of a large, CMS-driven institutional website.

Its pages are assembled from a headless CMS, but they also contain products, news, and other records owned by an integration layer. The content model is deeply nested and highly polymorphic; the same resources can appear through different branches, and the whole graph has to work across many locales. This is exactly the kind of pressure the resource graph resolver is designed to handle.

And it works. As expected, the UI stops discovering infrastructure dependencies. CMS and integration calls can be scheduled independently. Resource identities remain explicit, vendor code stays behind loaders, and the repository returns a `Page` rather than a bag of transport objects.

But as we move beyond the first few resources, a different problem appears: the architecture tells me where every piece of knowledge belongs, but it does not prevent the same decision from being expressed in several of those places.

In other words, correctness was no longer the main concern. The next problem was evolvability: how safely could the aggregate change without requiring several representations of the same decision to be updated by hand?

---

## Everything is separated, and everything has to agree

For one page aggregate, the feature repository contains roughly this set of parts:

- **Resource identities and payload types** define how each resource is addressed and which data it returns.
- **Data source composition** connects resource families to the operational channels that can load them.
- **Graph resolution strategy** decides which resource identities each resolved payload reveals next.
- **`ContentMap` projection** turns the resolved graph into the aggregate expected by the application.
- **Result types** describe the shape that the consumer receives.

This is not accidental duplication caused by a careless design. Each part has a different job.

For example, the strategy answers:

> Given this resolved resource, which resource identities should be loaded next?

while the projection answers:

> Given the resolved graph, which fields and relationships form the application aggregate?

For a small graph, the arrangement above is easy to follow. A Page expands to its menu, footer, and strips, a Hero expands to an Asset, and so on. The mapper follows the same relationships through the resolved `ContentMap` and places them under application-facing names such as `menu`, `image`, and `products`.

The pressure appears when the specification changes.

A one-to-one relationship becomes one-to-many. One CMS entry becomes polymorphic. A missing menu is allowed to become `null`, while a missing product still has to fail the whole aggregate. A custom encoded reference has to resolve first to an intermediate parsed object, and only then we can resolve that value to an Entry or Asset.

None of these changes is particularly difficult. More importantly, the architecture makes it clear where to implement each one. That clarity is what's valuable about the separation described in the previous article.

What makes me uneasy now is the number of places that have to remain synchronized.

Adding or changing one relationship can require editing:

- the resource payload that carries the reference;
- the expansion strategy that constructs the target identity;
- the projection that follows the relationship through the `ContentMap`;
- the TypeScript type describing the projected property;
- the failure behavior of that edge;
- and sometimes the data source composition required by the query.

The code is aligned now. But what happens after the next specification change, and the one after that?

I am no longer worried about finding the right file, and TypeScript catches many inconsistencies when those files drift apart. What bothers me is that I still have to keep several implementations of the **same decision** aligned by hand.
The issue is not silent failure. It is that I am working one level too low: manually updating every mechanism that follows from a decision I should be able to express once.

The graph is explicit at runtime, yet its application-specific meaning remains distributed across the implementation.

I want to reason about the aggregate itself, not about every lower-level artifact required to keep that aggregate consistent.

---

## The code feels one level too low

My first instinct is to improve the TypeScript API.

Perhaps a more sophisticated strategy builder could carry enough generic parameters to infer the projected type. Perhaps aliases could be threaded through the `ContentMap`. Perhaps a family of helpers could generate the mapper from the expansion policies.

Those ideas can make local code more pleasant, but they do not remove the underlying problem.

Traversal and projection are different operations. The strategy decides how the graph unfolds through resource identities; the projection decides what the resolved graph means to its consumer. Data source composition is different again: it decides which operational channel can materialize each identity.

They should remain separate mechanisms. What they lack is a shared semantic source.

Trying to solve that only with TypeScript types means asking the implementation language to recover an intention that the code never represents directly. The implementation encodes how to execute several parts of the process, but not the aggregate definition from which those parts follow.

That is why the implementation feels too low-level: every change forces me to translate one application decision into resolver machinery by hand.

The missing abstraction is not another builder. It is a query over the resource graph.

---

## JSON or YAML look like the obvious answer

Once the problem looks declarative, JSON or YAML seem like the obvious place to start.

I can describe resources, relationships, and policies in a configuration file, validate it with a schema, then generate the TypeScript strategy and mapper. That at least creates one document from which the lower-level pieces can be produced.

But the document needs to express more than nested configuration.

It needs bindings with scopes, so a query can say “given this particular resource instance, expand this field into that target resource” without losing track of what this refers to.

It needs to distinguish fields read from a payload from fields read from a resource identity, because a target address may be assembled from both.

It needs to narrow discriminated unions before accessing variant-specific fields, because a Hero and a Tabs entry do not expose the same relationships.

It needs to check that every constructed resource identity provides all of the fields required to address that resource, understand whether a relationship yields one resource or many, and derive the projected result type from those same decisions.

JSON and YAML can certainly be the concrete syntax of such a system. JSON Schema can validate the shape of the configuration, but it does not provide those semantics by itself. I still have to build a compiler around a generic object format, encode references as strings, and reconstruct useful source locations and diagnostics after parsing.

The editor experience exposes the same limitation. Syntax highlighting for YAML is easy, but it does not know that `locale` refers to the identity of the current Entry, that a field exists only inside the `Hero` branch, or that an Asset construction is missing one part of its address. Completion, go to definition, semantic diagnostics, and useful quick fixes require a semantic model, not merely a serialization format.

At that point the conclusion is unavoidable: I am designing a small language regardless of its concrete syntax. A dedicated syntax stops looking like ceremony because it can make bindings, identity reads, narrowing, and resource construction visible instead of encoding them indirectly inside strings and object keys.

---

## Am I just reinventing GraphQL?

At this point an obvious question is hard to avoid: am I just taking a very long route toward reinventing GraphQL?

The resemblance is real. Both approaches let a consumer describe a shape of data instead of manually sequencing every request. Both can express nested relationships, conditional structure, and derive a typed result from a declaration.

But the important difference is not the syntax. It is what architectural boundary I am choosing to introduce.

A GraphQL layer could absolutely solve this problem. It could sit in front of the CMS, integration APIs, SDKs, and other systems and expose the aggregate through one schema:

```text
GraphQL operation
        ↓
GraphQL schema + executor
        ↓
resolvers / subgraphs / integrations
        ↓
underlying systems
        ↓
single response
```

For a shared application API used by several clients, that can be a very good boundary.

But it is still a boundary that has to be designed, owned, and maintained.

If I put GraphQL in front of an existing CMS and integration landscape, I now have to decide how those systems map into the schema, write and maintain the resolver layer, define error semantics, authentication, caching and observability, and evolve that execution surface whenever the aggregate changes.

That cost may be entirely justified. But in real projects, that kind of firepower is not always available. You may not have a backend team ready to own a new execution layer, the budget to introduce and operate another service, or the organizational freedom to reshape several existing systems behind a new schema.

The orchestration problem still exists anyway.

The aggregates behind this problem are deeply nested and highly polymorphic. The next resources to load are often not known until previous payloads are resolved at runtime. I already have resource identities, loaders, data sources, batching, deduplication, and a resolver capable of walking that graph to closure.

What I am missing is not another universal data boundary.

I am missing a concise way to describe the graph that "this existing runtime" should resolve.

```text
resource-graph query
        ↓
resolution session
        ↓
resource identities discovered progressively
        ↓
existing data sources / loaders
        ↓
closure
        ↓
projection
```

In my opinion, this distinction matters.

The model I need does not require every data access path in the application to pass through a new boundary. A loader remains an ordinary TypeScript unit and can still be used directly when a simpler integration does not need graph resolution. A small feature can call one service, while another can use a more complex repository. Resource-graph orchestration enters only where the application actually has that problem.

What I need is therefore intentionally smaller than a general data execution platform. Existing loaders still own IO, and the resolver still owns execution; the language only has to describe the application-specific meaning of the graph.

**The goal is not to replace GraphQL. It is to avoid introducing a GraphQL execution boundary when the actual problem is application-level resource graph orchestration.**

GraphQL can still sit behind one of those data sources. In that case it is simply one way of materializing a resource during resolution, alongside REST, an SDK, a database, or an in-memory loader.

So the question is less “GraphQL versus another query language” and more “which boundary should own the orchestration?”

**GraphQL can own the aggregate boundary. Here, the application needs to resolve the aggregate across boundaries it already has.**

---

## What the language needs to say

With that distinction clarified, I return to the original problem: what does this language actually need to express?

The query does not need to describe SQL tables, HTTP requests, SDK calls, or React components. Those concerns already have owners.

It needs to say four things:

1. where graph resolution starts;
2. how a resolved resource reveals further resource identities;
3. which fields and relationships form the result;
4. which intermediate resources exist only to compute the next address.

To express those ideas without collapsing abstraction levels, the language also has to preserve a distinction that is fundamental to the resolver: a resource identity is not the same thing as its payload.

Consider a localized CMS entry:

```text
Entry identity
├── id
└── locale

Entry payload
├── kind
├── title
├── imageId
└── children[]
```

When expanding from an Entry to an Asset, the Asset ID may come from the Entry payload while its locale comes from the Entry identity. The declaration has to make those sources visible; pretending that every relationship is a foreign key contained in one payload field would encode the wrong model.

At this point, the model is no longer just configuration. It is a resource graph resolution program.

I called the language that emerges from that model: **Ziel**.

---

## Describe the destination, not the sequence of requests

The name **Ziel** comes from the German word for _goal_ or _destination_. It captures the main idea in the model.

Procedural orchestration describes a journey as a sequence of imperative steps:

```text
load the page from the CMS
then load its modules from the CMS
then extract product identifiers
then load products from the integration API
then load the referenced assets
then map everything into a Page
```

A Ziel query describes the graph and aggregate the application is trying to reach.

Conceptually, the query says:

- start from a Page and expand each of its modules as an Entry;
- whenever an Entry is encountered, inspect its variant: a Hero expands its image as an Asset, while a Product expands its SKU as a Product resource.

So far, we have described the aggregate without saying a single word about REST, GraphQL, HTTP, SDKs, databases, filesystems, or caches. That is deliberate.

The query does not decide how an Entry is loaded, nor which batch should run first. Data sources and the graph resolver still own that work.

It states which resources exist, how they are related for this aggregate, and which shape should emerge when resolution is complete.

**The language describes the destination. The runtime owns the walk.**

---

## Declaring the vocabulary of the graph

The following is a deliberately small version of the page model:

```ziel
scalar Locale on string;
scalar EntryId on string;
scalar AssetId on string;

resource Page(
  id: EntryId,
  locale: Locale
): {
  title: string
  modules: { id: EntryId }[] refers Entry
}

resource Entry(
  id: EntryId,
  locale: Locale
):
  {
    kind: "Hero"
    title: string
    imageId: AssetId refers Asset
  }
  | {
    kind: "Text"
    body: string
  }

resource Asset(
  id: AssetId,
  locale: Locale
): {
  url: string
  title: string
}
```

The parameters before `:` describe how a resource is addressed. The type after `:` describes the payload returned when that address is loaded.

`Entry(id, locale)` therefore identifies one Entry. Its `kind`, `title`, `body`, and `imageId` belong to the loaded value; changing one of those fields does not create a different address.

The `refers` annotations identify fields that participate in relationships, but they do not trigger resolution on their own. Different queries may traverse different relationships from the same resource vocabulary.

That distinction lets one query ask for a complete Page while another projects a smaller editorial preview without changing the loaders or the resource definitions.

---

## Traversal and projection come from one query

With the vocabulary in place, a query can describe the aggregate:

```ziel
query PageDetail(
  pageId: EntryId,
  locale: Locale
) {
  context {
    locale
  }

  root Page(
    id: pageId,
    locale: locale
  )

  on Page p include properties {
    expand modules: each link in p.modules (
      Entry(
        id: link.id,
        locale: @p.locale
      )
    )
  }

  on Entry e include properties {
    when e.kind == "Hero" {
      expand image: Asset(
        id: e.imageId,
        locale: @e.locale
      ) on failure set null
    }

    default { }
  }

  on Asset a include properties { }
}
```

`root` constructs the first resource identity from the query parameters. `on Page` describes what the Page contributes once its payload is available.

The `modules` expansion combines two decisions that otherwise live in separate files. It constructs the Entry identities the resolver must load, and it names the projected relationship that appears in the aggregate. `each` makes the cardinality explicit.

Inside the Entry projection, `when` narrows the payload before the query reads `imageId`. The image identity combines a value from the payload with `locale` from the current Entry identity. The failure policy belongs to that edge, so a missing image becomes `null` without turning every load failure into a soft failure.

These are not new responsibilities invented by the language. Every one of those decisions already exists in the handwritten strategy, mapper, result type, or resolver configuration.

The query makes their common meaning explicit.

---

## The compiler closes the synchronization gap

A `.ziel` file is not interpreted inside every request. The compiler checks the declarations and emits ordinary TypeScript.

For a resource it generates the ARI factory and payload contract, among other artifacts. An abridged output for `Page` looks like this:

```ts
export const pageAri = ari("Page", s.object({ id: s.string(), locale: s.string() }));

export type PageResource = ReturnType<typeof pageAri>;

export type PagePayload = {
  title: string;
  modules: { id: EntryId }[];
};
```

From the query it derives the projected result shape. Again abridged, the relevant part is:

```ts
export type PageDetail_Page = {
  title: string;
  modules: PageDetail_Entry[];
};

export type PageDetail_Entry_Hero = {
  kind: "Hero";
  title: string;
  image: PageDetail_Asset | null;
};

export type PageDetailResult = PageDetail_Page;
```

The array comes from `each`. The alias `image` comes from the expansion. Its `null` comes from `on failure set null`. If any of those decisions changes in the query, the generated type changes with it.

The compiler also generates the resolution strategy, projection materializer, query-specific data source factory, and a closed façade that assembles the ordinary runtime pieces. An abridged version looks like this:

```ts
export async function resolvePageDetail(input: ResolvePageDetailInput) {
  const executionContext = {
    locale: input.params.locale,
  };

  const root = pageAri({
    id: input.params.pageId,
    locale: input.params.locale,
  });

  const resolver = createResourceGraphResolver({
    sources: input.sources,
    strategy: createPageDetailStrategy(input.params).build(),
  });

  const { contentMap, islands, islandDependencies, errors, failures, promotedResourceKeys } =
    await resolver.resolve({
      roots: [root],
      executionContext,
    });

  const pageDetail = projectPageDetail(root, contentMap, {
    params: input.params,
    failures,
  });

  return {
    pageDetail,
    contentMap,
    islands,
    islandDependencies,
    errors,
    promotedResourceKeys,
  };
}
```

This is essentially the glue code that otherwise has to be repeated by hand for every query.

The compiler does not make application decisions. It produces several executable interpretations of one decision: an expansion strategy for the resolver, a projection for the consumer, and TypeScript contracts for both sides.

Changing the aggregate now means editing the declaration from which those pieces follow, rather than editing a pipeline and hoping every representation still agrees.

---

## If it is a language, the editor should understand it

A dedicated syntax only earns its place if it is better to work with than a generic configuration file.

Ziel therefore uses the same semantic model for code generation and for its language server. The editor does not merely color keywords. It knows which resource is being constructed, which bindings are in scope, whether a payload has been narrowed, which fields belong to an identity, and whether declarations in another file are compatible.

That allows the VS Code and Cursor extension to provide:

- syntax highlighting and document formatting;
- live syntax and semantic diagnostics;
- completion for resources, fields, bindings, and identity components;
- hover information and go to definition across files;
- quick fixes for declarations the compiler can complete safely.

This authoring experience is not an extra feature added after choosing a custom file extension. It is part of the reason to make the language explicit.

The editor should understand the same semantics the compiler enforces.

---

## Where Ziel becomes useful

Ziel is designed for applications whose aggregate is intrinsically compositional: many addressable resource families, several backends, data-dependent traversal, repeated resources, failure policies on individual edges, and enough change that the same decisions keep resurfacing across handwritten strategies, mapping, and result types.

That is common in large CMS-driven websites, commerce experiences, integration-heavy applications, and other systems where no single backend already owns the aggregate the application needs.

If one backend returns exactly the object a small frontend renders, Ziel may solve a problem that system does not have yet. But the threshold is not “wait until the codebase is unmanageable.” A useful way to evaluate the model is to express one real aggregate and see whether the query replaces knowledge that is currently duplicated across traversal, mapping, and types.

The cost of learning a small language should buy back a higher level of reasoning. When it does, the value is not only fewer lines of glue code. It is having one place where a change to the aggregate can be understood before it is lowered into runtime machinery.

---

## Changing the aggregate at the level where it is understood

The resource graph resolver provides the mechanism: discover addressable resources, route and batch them across heterogeneous data sources, and continue until the graph is resolved.

The architecture around it clarifies ownership: identities, loaders, data sources, strategies, and mapping stop bleeding into one another.

Putting that architecture under realistic pressure exposes the next missing layer. Although those responsibilities are correctly separated, traversal, projection, failure behavior, and result types remain several interpretations of the same aggregate definition. Keeping them aligned is manual work performed below the level at which the application decision is actually understood.

Ziel gives that decision a semantic representation and lets the compiler lower it into the mechanisms the runtime already knows how to execute.

The broader lesson is: when several pieces of **correct** code keep re-encoding the same decision, the problem may no longer be duplication. It may be that the architecture is missing a semantic representation for that decision.

That does not mean every configuration deserves a DSL. It means repeated procedural glue is sometimes a sign that the code is operating below the level where the real **intent** is actually understood.

Changing the aggregate should mean editing one declaration, not coordinating the same change across several parts of the codebase.

In [the next article](/blog/what-emerges-once-the-resource-graph-is-explicit-for-free/), I will look at what follows once that declaration exists: a typed anti-corruption boundary, replaceable data sources, gradual backend migrations, and operational resources that do not have to leak into the application aggregate.
