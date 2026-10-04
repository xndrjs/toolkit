---
title: "When a resource graph needs a language"
description: How testing a graph resolver against a large CMS-driven aggregate exposes the glue code left behind by a well-structured architecture—and why that pressure leads to Ziel.
date: 2026-10-03
author: Fabio Fognani
tags:
  - architecture
  - resource-graph
  - typescript
  - dsl
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

```text
Page repository
├── resource identities and payload types
├── data source composition
├── graph resolution strategy
├── ContentMap projection
└── result types
```

This is not accidental duplication caused by a careless design. Each part has a different job.

The strategy answers:

> Given this resolved resource, which resource identities should be loaded next?

The projection answers:

> Given the resolved graph, which fields and relationships form the application aggregate?

The resource declarations describe what can be addressed and what payload each address returns. Data source composition connects those resource families to operational channels. Result types describe what the consumer receives.

For a small graph, the arrangement is easy to follow. A Page expands to its menu, footer, and strips. A Hero expands to an Asset. A Product strip expands to records from an integration API. The mapper follows the same relationships through the resolved `ContentMap` and places them under application-facing names such as `menu`, `image`, and `products`.

The pressure appears when the specification changes.

A one-to-one relationship becomes one-to-many. One CMS entry becomes polymorphic. A missing menu is allowed to become `null`, while a missing product still has to fail the aggregate. A custom encoded reference has to resolve first to an intermediate locator and only then to an Entry or Asset. The same resource starts appearing under different aliases in different parts of the result.

None of these changes is particularly difficult. More importantly, the architecture makes it clear where to implement each one. That is precisely what the separation described in the previous article gets right.

What makes me uneasy is the number of places that have to remain synchronized.

Adding or changing one relationship can require editing:

- the resource payload that carries the reference;
- the expansion strategy that constructs the target identity;
- the projection that follows the relationship through the `ContentMap`;
- the TypeScript type describing the projected property;
- the failure behavior of that edge;
- and sometimes the data source composition required by the query.

The code is aligned now. But what happens after the next specification change, and the one after that?

I am no longer worried about finding the right file. I am worried that correctness depends on remembering every file that represents another interpretation of the same decision.

The graph is explicit at runtime, yet its application-specific meaning remains distributed across the implementation.

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

## JSON and YAML look like the obvious answer

Once the problem looks declarative, JSON or YAML seem like the obvious place to start.

I can describe resources, relationships, and policies in a configuration file, validate it with a schema, then generate the TypeScript strategy and mapper. That at least creates one document from which the lower-level pieces can be produced.

But the document needs to express more than nested configuration.

It needs bindings with scopes. It needs to distinguish fields read from a payload from fields read from a resource identity. It needs to narrow discriminated unions before accessing variant-specific fields. It needs to check that a target identity is complete, preserve nominal scalar types, understand one-to-one and one-to-many relationships, and derive the projected result type from the same declaration.

JSON and YAML can certainly be the concrete syntax of such a system. JSON Schema can validate the shape of the configuration, but it does not provide those semantics by itself. I still have to build a compiler around a generic object format, encode references as strings, and reconstruct useful source locations and diagnostics after parsing.

The editor experience exposes the same limitation. Syntax highlighting for YAML is easy, but it does not know that `locale` refers to the identity of the current Entry, that a field exists only inside the `Hero` branch, or that an Asset construction is missing one part of its address. Completion, go to definition, semantic diagnostics, and useful quick fixes require a semantic model, not merely a serialization format.

At that point the conclusion is unavoidable: I am designing a small language regardless of its concrete syntax. A dedicated syntax stops looking like ceremony because it can make bindings, identity reads, narrowing, and resource construction visible instead of encoding them indirectly inside strings and object keys.

---

## Am I just reinventing GraphQL?

At this point an obvious question is hard to avoid: am I just taking a very long route toward reinventing GraphQL?

The resemblance is real. Both approaches let a consumer describe a shape of data instead of manually sequencing every request. Both can express nested relationships, conditional structure, and a result whose type follows from a declaration. This is not accidental: once a language describes nested resource relationships and derives a typed shape, some ideas inevitably look familiar.

But the important difference is not the syntax. It is the execution boundary.

```text
GraphQL operation
        ↓
GraphQL execution boundary
        ↓
resolvers / subgraphs / services
        ↓
response
```

A GraphQL runtime can absolutely orchestrate heterogeneous systems, and when several clients need one stable application schema it may be the simplest boundary to own that work. Whether deployed as a separate API or embedded in the application, choosing it makes a GraphQL schema and executor the place where the aggregate is resolved; the integrations used to satisfy the operation live behind that execution layer.

The model I need starts from a different situation:

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

In this kind of architecture, REST APIs, GraphQL APIs, SDKs, caches, and integration services already exist. I am not looking to introduce a GraphQL schema and executor—either as another service or as an embedded runtime—as the owner of the aggregate. I need the application to resolve it across the boundaries that already exist, without letting that orchestration collapse back into the component tree.

> **Using GraphQL here makes its schema and executor the orchestration boundary. The language I need makes addressable resources and application-owned aggregate resolution primary.**

GraphQL can still sit behind one of the data sources. The relationship is therefore less “this language versus GraphQL” and more “GraphQL can be one way of materializing resources during a resolution.”

---

## What the language needs to say

With that boundary clarified, I return to the original problem: what does this language actually need to express?

The query does not need to describe SQL tables, HTTP requests, SDK calls, or React components. Those concerns already have owners.

It needs to say four things:

1. where graph resolution starts;
2. how a resolved resource reveals further resource identities;
3. which fields and relationships form the result;
4. which intermediate resources exist only to compute the next address.

To express those ideas without collapsing abstraction levels, the language also has to preserve a distinction that is fundamental to the resolver: a resource identity is not its payload.

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

I call the language that emerges from that model **Ziel**.

---

## Describe the destination, not the sequence of requests

The name **Ziel** comes from the German word for _goal_ or _destination_. It captures the main shift in the model.

Procedural orchestration describes a journey:

```text
load the page from the CMS
then load its modules from the CMS
then extract product identifiers
then load products from the integration API
then load the referenced assets
then map everything into a Page
```

A Ziel query describes the graph and aggregate the application is trying to reach:

```text
Page
└── modules[] → Entry
    ├── Hero → Asset
    └── Product → Product
```

The query does not decide whether an Entry is loaded with REST, GraphQL, an SDK, a database client, or an in-memory fixture. It does not prescribe which batch should run first. Data sources and the graph resolver still own that work.

It states which resources exist, how they are related for this aggregate, and which shape should emerge when resolution is complete.

> **The language describes the destination. The runtime owns the walk.**

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
      executionContext: { locale: input.params.locale },
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

This authoring experience is not an extra feature added after choosing a custom file extension. It is part of the reason to make the language explicit. The compiler and the editor should disagree as rarely as the generated strategy and projection do.

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

The broader lesson is not that every configuration deserves a DSL. It is that repeated procedural glue can be evidence of a missing language in the architecture—especially when several pieces of correct code must keep rediscovering the same meaning independently.

Changing aggregation should mean editing a declaration, not refactoring a pipeline.

In [the next article](/blog/when-the-backend-changes-but-the-resource-graph-does-not/), I will look at what follows once that declaration exists: a typed anti-corruption boundary, replaceable data sources, gradual backend migrations, and operational resources that do not have to leak into the application aggregate.
