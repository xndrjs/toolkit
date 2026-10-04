---
title: "What emerges once the resource graph is explicit - for free"
description: How explicit resource contracts turn loaders into anti-corruption boundaries and let infrastructure evolve without rewriting the aggregate.
date: 2026-10-05
author: Fabio Fognani
tags:
  - dsl
  - ari
  - resource-graph-resolution
  - ziel
---

In [the previous article](/blog/when-a-resource-graph-needs-a-language/), I described why repeated graph-resolution code led to Ziel.

The immediate problem was synchronization between several moving parts. A handwritten expansion strategy, a `ContentMap` projection, a result type, and the data source composition were different mechanisms, but several of their decisions came from the same definition of an aggregate. A Ziel query made that definition explicit, and the compiler generated the lower-level interpretations from it.

That was the benefit I was looking for.

Once we had a language for the resource graph, however, another set of consequences became visible. The resource declarations were no longer only inputs to code generation. They formed a stable contract between the graph the application understood and the systems that happened to materialize it.

That contract gave us something close to an anti-corruption layer by construction. It also made a useful promise precise: if a resource keeps the same semantic identity and payload, changing the backend that provides it should not require changing its place in the graph.

The condition in that sentence matters as much as the promise. Ziel cannot make two different resources identical by giving them the same TypeScript shape, and it cannot make a vendor migration "free". What it can do is reveal exactly which knowledge is stable and confine the changing knowledge to the boundary that owns it.

---

## The "three-shapes problem"

An integration-heavy application usually deals with at least three representations of the same broad concept.

Suppose a page contains a product strip. The commerce platform may return a vendor record such as:

```text
CommerceProductRecord
├── product_code
├── display_name
├── localized_copy
├── current_price
└── media_relations
```

The resource graph may need a smaller, stable contract:

```text
ProductResource
├── identity: sku + market
└── payload
    ├── title
    ├── priceId
    └── mediaId
```

The application aggregate may then project that resource together with other resolved resources:

```text
ProductView
├── title
├── price
└── image
```

These shapes will change in different moments, for different reasons.

The vendor record changes when a provider evolves its API. The resource contract changes when the application changes what it considers an addressable Product. The projected aggregate changes when the consumer needs a different view of that graph.

Treating them as one model feels efficient at first, but it couples three rates of change. A generated SDK type leaks the vendor into the graph; a resource payload reused directly as the view model makes every query return the same shape; a domain object used as a loader contract forces the outside world to conform to decisions that belong much later in the pipeline.

Ziel makes the middle representation explicit:

```text
Vendor response
      │
      ▼
TypeScript loader
      │ validates and translates
      ▼
Ziel resource contract
      │ resolves and projects
      ▼
Query-specific aggregate
```

That middle contract is what allows either side to change without automatically dragging the other with it.

---

## The loader becomes an anti-corruption boundary

A resource declaration describes the identity and payload understood by the graph:

```ziel
scalar Sku on string;
scalar Market on string;
scalar PriceId on string;
scalar MediaId on string;

// Price and ProductMedia declarations omitted.
resource Product(
  sku: Sku,
  market: Market
): {
  title: string
  priceId: PriceId refers Price
  mediaId: MediaId refers ProductMedia
}
```

From that declaration, Ziel generates the runtime identity factory and TypeScript payload type. A data source that owns Product receives a generated contract equivalent to this abridged form:

```ts
type ProductsConfig = {
  load: (
    batch: readonly ProductResource[],
    context: ResourceLoadContext<ProductsContext>
  ) => Promise<readonly (ProductPayload | undefined)[]>;

  batchSize?: number;
  concurrency?: number;
};
```

The vendor is absent from the signature.

The loader accepts identities from the resource model and must return payloads from the resource model, in the same order as the requested batch. It is therefore the point where the external representation has to stop.

A commerce-backed implementation might look schematically like this:

```ts
async function loadProducts(
  batch: readonly ProductResource[],
  { executionContext }: ResourceLoadContext<ProductsContext>
): Promise<readonly (ProductPayload | undefined)[]> {
  const response = await commerce.getProducts({
    skus: batch.map((product) => product.key.sku),
    market: executionContext.market,
  });

  const records = CommerceProductList.parse(response);
  const bySku = new Map(records.map((record) => [record.product_code, record]));

  return batch.map((product) => {
    const record = bySku.get(product.key.sku);
    if (!record) return undefined;

    return {
      title: record.display_name,
      priceId: Scalars.PriceId(record.current_price.id),
      mediaId: Scalars.MediaId(record.media_relations.primary.id),
    } satisfies ProductPayload;
  });
}
```

Authentication, SDK calls, runtime validation, vendor error handling, and this mapping remain ordinary TypeScript. Ziel neither performs nor hides that work. The graph resolver treats the payload returned by the loader as trusted, so validating untrusted data is still the adapter's responsibility.

What comes almost for free is not the transformation itself. It is the boundary and its compiler-checked target.

We do not need to invent a separate `ProductDTO`, manually keep it aligned with the graph, and make loaders return it consistently. The resource declaration already says what a Product means inside resolution, and the generated loader signature makes drifting away from that contract a TypeScript error.

**Ziel does not write the anti-corruption layer for us. It makes every loader a natural place to have one.**

This only becomes an anti-corruption boundary if the resource model is genuinely application-owned. Mirroring the vendor response in `.ziel` would not break anything; it would simply preserve the coupling instead of containing it.

---

## The query does not know where Product lives

The query constructs a Product identity because the aggregate needs a Product. In this simple example, `e` is a CMS `Entry` (`kind == "ProductCard"` is one variant of that entry), while `Product` is the separate e-commerce resource reached from its `sku`:

```ziel
when e.kind == "ProductCard" {
  expand product: Product(
    sku: e.sku,
    market: market
  )
}
```

It does not name the commerce platform, an endpoint, or a loader. Routing is described separately:

```ziel
datasource Products {
  context {
    market: Market
  }

  for Product
}
```

Application composition supplies the implementation:

```ts
const sources = createPageDetailDataSources({
  Products: {
    load: loadProductsFromCommerce(commerceClient),
    batchSize: 50,
    concurrency: 4,
  },
  // Other query-specific data sources...
});
```

Now suppose Product moves behind an internal integration service.

If that service can honor the same identity and payload contract, composition changes to:

```ts
const sources = createPageDetailDataSources({
  Products: {
    load: loadProductsFromIntegration(integrationClient),
    batchSize: 100,
    concurrency: 8,
  },
  // Other query-specific data sources...
});
```

The new loader speaks a different protocol and may have different operational limits, but it still accepts `ProductResource[]` and returns `(ProductPayload | undefined)[]`.

The resource declaration does not change. The expansion still constructs Product. The graph topology, generated projection, result type, and consumer do not change. Product has not become a different resource merely because another system now materializes it.

This small separation has a large architectural effect.

**The resource says what can be addressed. The data source says how it is materialized today.**

---

## The stability condition is semantic, not structural

It is easy to overstate backend replaceability.

Two identities are not the same merely because both contain a string named `id`. A Contentful entry ID and a catalog SKU belong to different namespaces and may represent different units of meaning. Likewise, two payloads are not the same contract merely because TypeScript considers their fields assignable.

The graph can remain unchanged only if the resource is still semantically the same resource.

That gives us a useful way to classify migrations:

| What changed                                 | Expected change surface                                      |
| -------------------------------------------- | ------------------------------------------------------------ |
| Vendor protocol only                         | loader implementation and operational options                |
| Backend ownership, same identity and payload | loader/composition                                           |
| Vendor shape, stable resource payload        | validation and mapping inside the loader                     |
| Resource payload semantics                   | resource declaration, loaders, and affected queries          |
| Resource identity semantics                  | identity declaration and every construction of that identity |
| Application aggregate                        | query projection and generated result type                   |

Suppose the first version of an Asset identity contains `spaceId`, `environmentId`, `id`, and `locale`. Those first two fields encode assumptions from the CMS. A new asset service may still be able to honor that address, perhaps through a lookup table, but the contract is not magically vendor-neutral because it was declared in Ziel.

If the application now recognizes Asset by a global media ID, then its identity really changed. The declarations and expansions should change too. Hiding that fact inside a loader would preserve source compatibility by making the resource model dishonest.

The same applies to data source context. Switching providers may require a new semantic input such as a tenant or market. If the query did not previously expose that context, its parameters and generated façade may need to evolve. Credentials and clients can stay in dependency injection, but values that participate in routing or resource semantics must remain visible.

Ziel does not promise that migrations have no consequences. It makes the size of a consequence correspond more closely to the kind of knowledge that changed.

---

## Old and new backends can coexist

Replacing a backend is rarely an atomic operation. One market may move first, preview traffic may stay on the old provider, or only a subset of identities may have been migrated.

Ziel data source routes can use execution context and resource identity before loading begins. That lets two sources temporarily claim different portions of the same resource family:

```text
Product identity
      │
      ├── migrated market ──> integration Products source
      │
      └── other market ─────> legacy Commerce source
```

The generated sources remain ordered, and the resolver uses the first matching route. A routing predicate is therefore an ownership decision, not a fallback mechanism: if the selected source returns a miss, the resolver does not automatically try the next one.

That constraint is useful. Falling through after a miss would blur the difference between routing and recovery, make ownership ambiguous, and potentially turn a deleted resource into a stale result from the old system.

During a gradual migration, the query continues to ask for Product. Which provider currently owns a particular Product is kept in the routing layer, where that decision can later be removed without rewriting the aggregate.

---

## The operational graph can be richer than the aggregate

Backend migrations are not always a matter of changing one loader. Legacy systems often expose references that are not valid identities in the target system.

One institutional site stored some links as encoded strings. Parsing the string with a regex revealed whether it referred to an Entry or an Asset and supplied the components required to construct that target address.

The decoder was operationally real. It had to run, could fail, and produced information required by further resolution. But the application did not need a `CustomReference` object in the resulting Page.

Ziel can represent that intermediate step as a resource and then redirect through it:

```ziel
resource CustomReference(
  value: CustomReferenceValue,
  locale: Locale
):
  {
    kind: "Entry"
    id: EntryId
  }
  | {
    kind: "Asset"
    id: AssetId
  }

on CustomReference ref resolve to {
  Entry(
    id: ref.id,
    locale: @ref.locale
  ) when ref.kind == "Entry"

  Asset(
    id: ref.id,
    locale: @ref.locale
  ) when ref.kind == "Asset"
}
```

An expansion can target `CustomReference`; the resolver loads and inspects it, then continues from the resulting Entry or Asset identity. Projection follows the redirect and places the final resource under the original alias.

The resolved graph is allowed to contain machinery that the application aggregate has no reason to expose.

This is another form of anti-corruption. Stability does not require pretending the infrastructure is simple. It requires giving infrastructure complexity an explicit place from which it cannot leak accidentally into every consumer.

### But sometimes the intermediate resource is the result

What we just said does not mean `CustomReference` should always disappear from the result.

In another query, the reference itself may be exactly what the application wants to inspect. A migration or validation tool, for example, may need to collect all custom references as stored and determine which of them still point to valid resources.

In that case, the query would keep the `CustomReference` visible and expand its target explicitly instead of using `resolve to`:

```ziel
on CustomReference ref include properties {
  when ref.kind == "Entry" {
    expand target: Entry(
      id: ref.id,
      locale: @ref.locale
    ) on failure set error
  }

  when ref.kind == "Asset" {
    expand target: Asset(
      id: ref.id,
      locale: @ref.locale
    ) on failure set error
  }
}
```

The projected result now preserves the original reference (automatically added by `include properties`) and adds the resource it claims to target. A failed expansion can remain visible as an error value, making it possible to distinguish valid references from stale ones.

The same resource can therefore be collapsed away in one aggregate and deliberately preserved in another. So, `resolve to` is not an intrinsic property of `CustomReference`: it is one possible handling of that resource in a particular query.

---

## The language stops before IO and business logic

Once a language can express conditional traversal, redirects, and routing, it is tempting to keep adding features until every calculation can move into it.

That would erase the boundary that makes it useful.

Ziel describes addressable resources, the relationships required by an aggregate, data source ownership, and projection. TypeScript still owns unrestricted computation and communication with the outside world:

- authentication and vendor clients;
- runtime validation and normalization;
- retries, telemetry, and provider-specific errors;
- calculations that are not graph semantics;
- business rules that compare several resolved resources.

If a legacy code must be decoded before the next identity is known, a TypeScript loader can expose that computation as a small resource and let the query continue from it. The calculation remains testable ordinary code; the fact that it participates in resolution remains explicit in the graph.

```text
TypeScript computes values and talks to the outside world.
Ziel gives resource-graph resolution an explicit semantic shape.
```

The DSL pays rent while it keeps those levels separate. Becoming a general-purpose runtime would make it another place for application logic to hide.

---

## This is a boundary choice, not a claim that every app needs one

A backend-for-frontend or a GraphQL API can expose the same stable aggregate behind a network boundary. If an organization already owns that service and several clients benefit from its schema, it may be the right place for the orchestration.

Ziel starts from a different ownership situation: the application needs an aggregate composed from independently addressable resources, no single backend already owns it, and creating another deployed service is not the desired solution. Maybe it's not an option at all.

GraphQL can still be one of the loaders behind a data source, just like REST, an SDK, a database, or an in-memory fixture. The relevant question is not which technology can represent nested data. It is where the orchestration contract should live and who should own its operational cost.

For a small frontend consuming responses from just one backend, this separation may add little. For a CMS-driven or integration-heavy system in which resources already move across teams and providers, it turns infrastructure evolution into a set of explicit, local decisions.

---

## Stable does not mean frozen

Ziel began as a way to keep traversal, projection, failure policies, and result types aligned. Making the resource graph declarative also created a stable middle contract between vendor data and application aggregates.

That contract does not eliminate migration work. A new backend still needs an adapter. External data still needs validation. A genuine change in identity or payload should still propagate to the declarations and queries that depended on it.

What changes is the blast radius.

When only the vendor protocol changes, the loader changes. When ownership moves but identity and payload remain stable, the loader and composition change; routing changes only if source ownership is renamed or repartitioned. When the application wants a new aggregate, the query changes. Operational resources can participate in resolution without leaking into the result, and generated types expose the places where a semantic contract really did move.

A stable resource graph does not mean the infrastructure stops changing.

It means the infrastructure can change without every consumer having to learn how it changed.
