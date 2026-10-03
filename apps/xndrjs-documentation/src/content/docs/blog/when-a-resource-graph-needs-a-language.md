---
title: "When a resource graph needs a language"
description: How repeated graph-resolution code exposed a missing declarative boundary, and why that boundary became Ziel.
date: 2026-10-03
author: Fabio Fognani
tags:
  - architecture
  - resource-graph
  - typescript
  - dsl
---

In [the previous article](/blog/every-component-fetches-its-own-data-until-it-cant/), I started from a problem that had initially looked like a frontend concern: the component tree had become the distributed place where a graph of resources was discovered. Letting each component load its own data was reasonable in isolation, but once nested components began discovering further dependencies, rendering also became responsible for orchestrating a process that extended far beyond the UI.

To move that responsibility out of the rendering tree, I introduced a model based on [Addressable Resource Identifiers (ARIs)](/v0/resource-orchestration/addressable-resources/) and a resource graph resolution engine. Starting from one or more root identities, the engine discovers further resources from the payloads it loads, routes them to the appropriate data sources, batches and deduplicates the work, and continues until the graph has been resolved. The point was not to give the view a graph to traverse, but to deliver a purpose-built aggregate that it could simply render.

Consider a page on a large institutional website. Most of its editorial structure may come from a headless CMS, yet some records can refer to SKUs owned by a commerce platform while others point to resources exposed by an integration layer. References do not necessarily share one convenient representation either: a custom format may need to be parsed, sometimes with something as specific as a regular expression, whereas a compound reference may carry several fields that jointly contribute to the target identity.

What the application wants is still just a page:

```text
Page
├── menu
│   └── logo
├── strips[]
│   ├── Hero
│   │   └── image
│   ├── Tabs
│   │   └── tabs[]
│   └── Product
└── footer
    └── logo
```

The resolver gave us the mechanism required to discover and load this graph without turning the view into an orchestration layer. After using that model for real aggregates, however, another problem became difficult to ignore: we still had to describe the same graph several times, across several parts of the codebase, and write a considerable amount of glue code to keep those descriptions aligned.

---

## Implementing the first graph resolver

The first implementation of a Resource Graph Resolver (RGR) was ordinary TypeScript: we defined an address for each kind of resource, registered the data sources, built a graph resolution strategy, and finally wrote a mapper that walked the resolved `ContentMap` to produce the object expected by the application.

Conceptually, the feature repository looked like this:

```text
Page repository
├── resource identities
├── data source composition
├── expansion strategy
├── ContentMap projection
└── result types
```

This was not a bad design, because each piece had a clear responsibility: the resolver remained generic, vendor adapters owned transport details, and the feature repository owned both the topology of the aggregate and its final shape. For a small graph, the code was easy to follow as well. The strategy said that a `Page` expands to its menu, footer, and strips, another rule expanded a Hero to an Asset, and the mapper followed those relationships through the `ContentMap`, assigning them to properties such as `menu`, `footer`, and `image`.

The pressure appeared as the graph evolved. A field that had contained a single entry ID became a list, some entries became polymorphic, and one link needed a soft failure policy while another still had to fail the entire aggregate. Elsewhere, a custom encoded reference first resolved to an intermediate locator and only then to an entry or asset, while the same resource began to appear under different aliases.

None of these changes was individually dramatic; the problem was the number of places that had to agree about them.

Adding one relationship could mean changing:

- the expansion strategy that constructs the target identity;
- the projection that follows the same relationship through the ContentMap and places the resolved target in the aggregate;
- the TypeScript type describing the projected property;
- the failure behavior of that edge;
- the data source composition required by the query;

The traversal code and the projection code were not identical, but they contained the same knowledge. When the strategy expanded `page.menuId` as an `Entry`, the projector had to know that the resulting Entry was supposed to have `kind: "Menu"`; when a `Tabs` entry expanded several tab IDs, it had to reconstruct an array of `Tab` at the same location.

The graph was explicit at runtime, yet its meaning remained distributed across the implementation.

---

## Type safety did not remove the duplication

It was tempting to treat this as a TypeScript ergonomics problem: perhaps more generic helpers could infer the mapper, the strategy builder could carry additional type parameters, or the aliases used during expansion could somehow be threaded through the `ContentMap`. Those approaches can improve local APIs, but they do not remove the underlying duplication.

The strategy answers:

> Given this resource, which resource identities should be resolved next?

The projection answers:

> Given the resolved graph, which fields and relationships form the result?

These are different operations, but they are not independent descriptions. Resolution determines how the graph unfolds through resource identities and dependencies, while projection determines what the resolved graph means to its consumer. Both derive from the same definition of the aggregate, yet the handwritten implementation forced us to express that definition separately and keep the two interpretations aligned ourselves.

Trying to encode all of this indirectly through TypeScript builder types meant asking the implementation language to recover an intention we had never represented directly. The missing abstraction was not another helper, but a query over the resource graph.

---

## What such a query would need to say

Such a query would not describe SQL tables, HTTP requests, or React components. It would need to describe four things:

1. where graph resolution starts;
2. how a resolved resource reveals more resource identities;
3. which parts of each payload belong in the result;
4. how intermediate resources "redirect" to other resources.

To do that without collapsing infrastructure concerns together, the query would also need to preserve a distinction that had already proved important in the resolver: a resource identity is not its payload.

Consider a localized CMS entry whose address contains a space, environment, entry ID, and locale, while its payload contains a title, an image reference, or a list of child entries.

Those values live at different abstraction levels:

```text
Entry identity
├── spaceId
├── environmentId
├── id
└── locale

Entry payload
├── kind
├── title
├── imageId
└── tabs[]
```

When expanding from an Entry to an Asset, some parts of the Asset identity may come from the Entry payload, while others come from the Entry identity or the query input. The query language therefore had to make those sources visible instead of pretending that every relationship was a foreign key stored in one field.

At this point, a nicer API around the strategy builder was no longer enough. What we were describing was a resource graph resolution program, and the language that emerged from that model became **Ziel**.

---

## Describe the destination, not the journey

The name **Ziel** comes from the German word for _goal_ or _destination_. That meaning also captures the idea behind the language.

When navigating by the stars, you do not steer by continuously inspecting the seabed beneath you. You orient yourself against stable points farther away and use them to determine where you are going.

Ziel takes a similar view of data orchestration: instead of encoding every operational step of data acquisition or hardcoding the current infrastructure split — which resource lives in the CMS, which comes from an integration service, a database, or something else — a query describes the resource graph and projected aggregate the application is trying to reach. Where a resource happens to live is an implementation detail; the aggregate is the application concern. If that split changes, the ideal outcome is a routing or datasource change, not surgery across the orchestration code.

The query does not prescribe a sequence such as:

```text
fetch page from CMS
then fetch menu from CMS
then fetch strips from CMS
then extract product SKUs
then fetch products from ecommerce
then resolve recommendations through the integration layer
then group entry IDs
then batch assets from CMS
then map everything into the page aggregate
```

It declares the destination:

```text
Page
├── menu → Entry
├── strips[] → Entry
│   ├── Hero → Asset
│   ├── Tabs → Entry[]
│   └── Product → Product
│                  └── recommendations → Recommendation[]
└── footer → Entry
```

The first description bakes the current infrastructure split into the orchestration itself. The second describes only the resource relationships the application cares about; datasources decide where those resources happen to come from today.

If Product moves from the ecommerce backend to an integration service, the aggregate should not need to be rewritten. Ideally, only the routing or datasource declaration changes.

> **Procedural orchestration keeps looking at the ground: “what do I do next?” Declarative orchestration keeps looking at the stars: “what state am I trying to reach?”**

The resolver, data sources, and loaders remain responsible for the walk. They route identities, batch compatible work, deduplicate resources, follow redirects, and continue until no newly discovered identities remain. The declaration stays focused on the destination: describe the graph you need and let the runtime determine how to get there.

---

## Declaring the vocabulary of the graph

Ziel starts with resources, whose declarations keep identity separate from payload:

```ziel
scalar Locale on string;
scalar EntryId on string;
scalar AssetId on string;

resource Asset(
  id: AssetId,
  locale: Locale
): {
  kind: "Asset"
  id
  title: string
  url: string
}

resource Page(
  id: EntryId,
  locale: Locale
): {
  id
  title: string
  menuId: EntryId refers Entry with { kind: "Menu" }
  strips: { id: EntryId }[] refers Entry
}

resource Entry(
  id: EntryId,
  locale: Locale
):
  {
    kind: "Hero"
    id
    title: string
    imageId: AssetId refers Asset
  }
  | {
    kind: "Tabs"
    id
    title: string
    tabs: { id: EntryId }[] refers Entry
  }
  | {
    kind: "Menu"
    id
    title: string
  }
```

`Entry(id, locale)` describes how an Entry is addressed, whereas the type after `:` describes the payload returned by its data source. The Entry variants share the same identity because `kind` belongs to the payload and therefore does not create a second resource address.

The `refers` annotations identify relationship-bearing fields. An optional payload pattern such as `with { kind: "Menu" }` can also narrow the known target variant, but these annotations do not prescribe graph traversal by themselves.

That last point matters. Writing:

```ziel
imageId: AssetId refers Asset
```

does not load an Asset; it only says that this payload field participates in a relationship with `Asset`. Traversal remains explicit in the query.

---

## Describing traversal and projection together

A query chooses a root and defines what each encountered resource contributes to the aggregate:

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
    expand menu: Entry(
      id: p.menuId,
      locale: @p.locale
    ) on failure set null

    expand strips: each stripLink in p.strips (
      Entry(
        id: stripLink.id,
        locale: @p.locale
      ) on failure set null
    )
  }

  on Entry e include properties {
    when e.kind == "Hero" {
      expand image: Asset(
        id: e.imageId,
        locale: @e.locale
      ) on failure set null
    }

    when e.kind == "Tabs" {
      expand tabs: each tabLink in e.tabs (
        Entry(
          id: tabLink.id,
          locale: @e.locale
        ) on failure set null
      )
    }

    default { }
  }

  on Asset a include properties { }
}
```

The example contains several ideas, but each corresponds to knowledge that already existed in the handwritten implementation. `root` constructs the first resource identity from query parameters, while `on Page` describes what happens once its payload is available. `include properties` keeps ordinary payload fields and leaves relationships to explicit expansions.

Within that projection, `expand menu` both gives the relationship an aggregate-level name and constructs the target Entry identity: `p.menuId` reads from the Page payload, whereas `@p.locale` reads from its identity. The `each` form makes cardinality explicit, so the projected property is an array because the relationship is one-to-many, not because the Entry data source happens to load a batch.

The `when` arms narrow a polymorphic payload before referring to fields that exist only on one variant, and failure behavior remains attached to the relevant edge; a missing menu can therefore become `null` without making every failure in the query soft. Most importantly, the aliases declared by those expansions become the aliases in the result, which means the query describes not only what the resolver should load but also what those resolved relationships mean to the aggregate.

---

## A reference does not have to contain a complete identity

Simple examples often make relationships look like one field pointing to one ID:

```ziel
assetId: AssetId refers Asset
```

Real references are not always that convenient. A taxonomy term, for example, may be addressed by `kind`, `id`, and `locale`, even though the source payload carries only the first two values and locale must come from the current resource identity:

```ziel
resource TaxonomyTerm(
  kind: TaxonomyKind,
  id: TermId,
  locale: Locale
): {
  kind
  id
  label: string
}

resource Page(
  id: EntryId,
  locale: Locale
): {
  id
  primaryTerm: {
    kind: TaxonomyKind
    id: TermId
  } refers TaxonomyTerm
}
```

The complete target identity is assembled where the relationship is expanded:

```ziel
expand primaryTerm: TaxonomyTerm(
  kind: p.primaryTerm.kind,
  id: p.primaryTerm.id,
  locale: @p.locale
)
```

Ziel does not require the object carrying `refers TaxonomyTerm` to contain every identity field, because that would enforce the wrong invariant. A reference may contribute only part of an identity, with the remaining components coming from the source identity or query parameters; completeness becomes checkable at the point where the target resource is actually constructed. If `locale` is missing, or one of the supplied values has the wrong nominal scalar type, the query does not typecheck.

The relationship declaration identifies the target vocabulary, while the expansion defines the actual mapping.

---

## Some resources exist only to compute the next address

Not every resource loaded during resolution belongs in the final aggregate. A production-shaped example is a custom reference stored as an encoded string: loading it produces a small payload that identifies the target as either an Entry or an Asset and supplies the fields needed to address that resource.

The locator is operationally real - it must be loaded and inspected - but exposing it in the projected Page would leak an implementation detail.

Ziel represents this with `resolve to`:

```ziel
on CustomReference c resolve to {
  Entry(
    id: c.id,
    locale: @c.locale
  ) when c.kind == "Entry"

  Asset(
    id: c.id,
    locale: @c.locale
  ) when c.kind == "Asset"
}
```

An expansion can point to `CustomReference`, allowing the resolver to load it, after which projection follows the redirect and places the resulting Entry or Asset directly under the original alias. The intermediate computation remains part of graph resolution without entering the application-facing shape, so the resolved graph can contain machinery that the aggregate has no reason to expose.

---

## Data sources still own the outside world

A declarative graph query should not become a new place to hide HTTP calls.

Ziel can declare which resource families belong to a data source and which execution context that source requires:

```ziel
datasource CmsEntries {
  context {
    locale: Locale
  }

  for Page
  for Entry
}

datasource CmsAssets {
  context {
    locale: Locale
  }

  for Asset
}
```

Routes can also be refined with an optional `when` clause — schematically, `for Entry e when <routing condition>` — when the same resource family may be served by more than one data source. Because the predicate is evaluated before loading begins, it can inspect the data source context and the resource identity through `@e`, but not the resource payload.

The actual `load` implementation remains TypeScript, and its contract is deliberately agnostic about where the data comes from: a data source may issue HTTP requests, call a vendor SDK, query a database, read from the filesystem, or wrap an in-memory store. Authentication, validation, batching limits, retries, and vendor-specific errors therefore remain at that level, while Ziel describes routing metadata and the semantic graph without trying to become an IO language.

This boundary is deliberate:

```text
Ziel query
    │
    │ declares identities, relationships and result shape
    ▼
Generated resolution strategy
    │
    │ constructs ARIs and discovers dependencies
    ▼
Resource graph resolver
    │
    │ routes, batches, schedules and deduplicates
    ▼
TypeScript data sources
    │
    │ perform IO
    ▼
ContentMap
    │
    │ projected using the same query declaration
    ▼
Application aggregate
```

The language raises the level at which the aggregate is described without pulling transport concerns into that level.

---

## The compiler closes the gap

A `.ziel` file is not interpreted inside every request. The compiler parses and checks its declarations, analyzes each query, and generates ordinary TypeScript artifacts:

- nominal scalar types and ARI factories;
- resource payload types and a registry that associates each ARI family with the payload returned for it;
- graph resolution strategies;
- query-specific data source factories;
- cycle-safe projection materializers;
- result types;
- and a closed `resolve*` façade for each query.

Application code supplies the data source implementations and invokes the generated façade:

```ts
const result = await resolvePageDetail({
  params: {
    pageId,
    locale,
  },
  sources,
});

result.pageDetail;
```

The façade constructs the root identity, creates the strategy, runs the resolver, and projects the resulting `ContentMap`, while the lower-level pieces remain available when an application needs more control. The default path simply stops asking every feature to reassemble that pipeline by hand.

What matters is not the amount of generated code, but the fact that traversal, projection, and their types derive from the same semantic source. Changing an expansion from one resource to many turns the generated result into an array; adding a soft failure policy makes the affected edge nullable or error-valued; and changing the possible targets of a redirect updates the projected union.

The compiler does not invent application behavior; it keeps several interpretations of one declaration aligned.

---

## A DSL should help you write it

Choosing a dedicated syntax instead of plain JSON or YAML only makes sense if the language also improves the authoring experience. Ziel therefore ships with a VS Code extension that provides syntax highlighting, live diagnostics, completion, hover information, go to definition, quick fixes, and document formatting.

These features are driven by the same language server and semantic model used by codegen, so the editor understands concepts such as resource identities, scoped bindings, narrowed payloads, and cross-file declarations rather than treating a query as a generic object tree. JSON or YAML could store similar configuration, but the dedicated language makes those semantics available while the query is being written.

The extension also works with Cursor. If **Ziel** does not appear in its extension search — Open VSX indexing may lag behind a release — it can be installed directly by identifier:

```sh
cursor --install-extension xndrjs.ziel-vscode
```

---

## Ziel is not a GraphQL clone

At this point, the resemblance to GraphQL is hard to ignore.

Both languages let an application describe a shape of data instead of manually orchestrating every request. Both can express nested relationships, conditional structure, and a result whose type follows the declaration. If Ziel had emerged without GraphQL existing, some of its ideas would still look familiar for good reason.

> **The important difference is not syntax. It is the execution boundary.**

A GraphQL operation is evaluated against a GraphQL schema. However the server obtains the underlying data (through database queries, REST calls, other services, or further GraphQL requests) that integration sits behind the GraphQL execution layer.

Ziel starts from a different situation: the application already has several independently addressable resource families and several ways of materializing them, but no single backend exposes the aggregate it needs.

```text
GraphQL

operation
   ↓
GraphQL execution boundary
   ↓
resolvers / subgraphs / connectors
   ↓
data sources
   ↓
response
```

```text
Ziel

resource-graph query
   ↓
resolution session
   ↓
resource identities are discovered progressively
   ↓
data sources / loaders
   ↓
more identities may be discovered
   ↓
closure
   ↓
projection
```

This distinction matters when the shape of the work is itself discovered while resources are being resolved. A Ziel query does not need to become one progressively larger transport query: loading an Entry may reveal ten more Entries, which may in turn reveal Assets or resources owned by another system. The resolver can schedule that work incrementally, batch compatible identities, deduplicate branches that converge on the same address, and stop when no further work remains.

GraphQL can of course orchestrate heterogeneous systems as well. A well-designed GraphQL API or BFF may be exactly the right solution, especially when several clients should share one stable application schema.

> **That was simply not the boundary I needed.**

The systems I was working with already exposed REST APIs, GraphQL APIs, SDKs, caches, and integration services. Building another backend solely to move orchestration away from the frontend would have solved the ownership problem by relocating it, but it would also have introduced another service to design, deploy, operate, and evolve.

Ziel lets that orchestration live with the application while keeping transport-specific work behind data sources. This also means that GraphQL is not something Ziel needs to replace: a GraphQL endpoint can be one of its loaders just as easily as a REST API, database adapter, SDK, filesystem reader, or in-memory fixture.

The relationship is therefore less **"Ziel versus GraphQL"** and more **"GraphQL can be one way of materializing resources inside a Ziel resolution".**

The two abstractions overlap, but they make different things primary. GraphQL starts from a schema exposed through a GraphQL execution boundary, whereas Ziel starts from addressable resources and asks how an application can resolve the aggregate it needs across whatever execution boundaries already exist.

---

## Ziel is intentionally not a general-purpose language

Once a language can describe recursive expansion, conditional branches, and intermediate redirects, it is easy to ask whether every calculation should move into it.

That is not the goal. Ziel describes how an aggregate is resolved from addressable resources, so it has no reason to own arbitrary business logic, mutations, vendor SDKs, or unrestricted computation.

If resolving an identity requires normalization or a calculation better expressed in TypeScript, a data source can expose a resource whose payload contains the normalized information and let the query continue expanding from there. The complete system remains expressive without turning the DSL itself into another application runtime.

The distinction is useful:

```text
TypeScript computes values and talks to the outside world.
Ziel gives resource-graph resolution an explicit semantic shape.
```

The abstraction pays rent only while it keeps those responsibilities separate.

---

## When not to use it

A BFF can absolutely expose a complete aggregate; if that endpoint is stable, owned by the right team, and cheap to evolve, adding a graph resolver and a DSL would be unnecessary. The same applies to a feature that loads two resources in a fixed sequence, where ordinary TypeScript stays easier to understand and operate.

Ziel becomes interesting when the aggregate is intrinsically compositional:

- its shape depends on the payloads encountered during traversal;
- it spans several resource families or backends;
- the same resource may appear through different relationships;
- batching and deduplication matter;
- intermediate calculations should not leak into the output;
- or changes repeatedly require synchronized edits to strategy, mapping, and types.

The cost is real: there is a language to learn, a compiler in the build and another semantic boundary to maintain. That cost is justified when the graph exists in the system; Ziel should make existing orchestration explicit, not encourage an application to manufacture a graph it does not need.

---

## Changing the aggregate at the level where it is understood

The resource graph resolver gave us a generic mechanism for resolving addressable resources across heterogeneous data sources, but it did not provide a single place to express the feature-specific meaning of that graph. Handwritten strategies and mappers worked until the same relationships had to remain synchronized across traversal, projection, types, failure policies, and composition; more TypeScript abstractions could move that knowledge around, but they could not make it singular.

Ziel is an attempt to place that knowledge at the level where it is understood. A query says where resolution begins, how resources reveal other resources, which intermediate computations disappear, and what aggregate shape should emerge, while the compiler lowers that declaration into mechanisms the runtime already knows how to execute.

The broader lesson is not that every orchestration problem needs a DSL, but that repeated procedural code sometimes points to a missing semantic representation. When the graph changes, the strategy, mapper, and result type should not have to rediscover the same decision independently.

Changing aggregation should mean editing a declaration, not refactoring a pipeline.
