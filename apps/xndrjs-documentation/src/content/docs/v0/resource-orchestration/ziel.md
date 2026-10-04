---
title: Ziel
description: Compile-time typed aggregate resolver — concepts and laws, stability, when not to use it, and an operational runbook.
---

`@xndrjs/ziel` is a **compile-time, typed aggregate resolver** for TypeScript applications: resource identity (ARI), multi-backend batching, projection, and cache islands. It sits on [`@xndrjs/resource-graph-resolver`](/v0/resource-orchestration/resource-graph-resolver/).

Package README and DSL reference: [`packages/ziel`](https://github.com/xndrjs/toolkit/tree/main/packages/ziel). Editor: [`ziel-vscode`](https://github.com/xndrjs/toolkit/tree/main/packages/ziel-vscode) (`xndrjs.ziel-vscode`). Vertical slices: CMS-shaped [`ziel-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/ziel-demo) and commerce-shaped product detail in the same app (`ziel/queries/product-detail.ziel`).

## Positioning

If your frontend is coordinating multiple resources to build one application view, Ziel gives that orchestration an explicit model instead of letting it emerge from components, hooks, and glue code.

Ziel is designed for **aggregate resolution over resource graphs**. It is most useful when the system already has a resource graph, but no single backend owns the aggregate it needs.

| Use Ziel when…                                                                                     | Prefer something else when…                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Your application must assemble an aggregate across multiple addressable resources                  | A backend already exposes the aggregate in the shape you need      |
| Resource relationships are discovered progressively from loaded payloads                           | The retrieval path is fixed and trivial                            |
| You want orchestration to live outside the UI without building another bespoke BFF                 | A dedicated BFF is already the natural ownership boundary          |
| You want traversal, projection, failure semantics, and result types to derive from one declaration | A few handwritten calls are clearer than introducing a graph model |
| The same graph may be materialized through different loaders, caches, or environments              | Data acquisition is already stable and local to one client/API     |

Don’t introduce Ziel when a single request already gives you the aggregate, or when the orchestration is too small to deserve its own model.

## Concepts and laws

The sections below introduce each concept in order: what a resource is, how identity works, how relationships are declared, and only then how a query walks the graph. Each concept is expressed in the Ziel language (authored in `.ziel` files), checked by the compiler, and lowered by codegen into the runtime strategy and projection surface that `@xndrjs/resource-graph-resolver` executes.

### A resource is a name, an identity, and a payload

In Ziel you declare **resources**: addressable units the resolver can load. Each declaration has three parts:

1. a **name** (`Page`, `Entry`, `Asset`, …) — the resource family;
2. **identity parameters** — the fields that uniquely address one instance of that family (the [ARI](/v0/resource-orchestration/addressable-resources/));
3. a **payload type** — what you get after that instance is loaded.

The notation is:

```ziel
resource Name(...identityParams): Payload
```

`Payload` is the TypeScript-facing type of the loaded value — not another ARI. It is often an object shape or a discriminated union, but it may also be an array, a scalar or opaque type ref, or a type projection. Object-shaped payloads are what `include` / field selection / `refers` operate on; non-object roots still load and project as opaque pass-through leaves when selected or left empty.

```ziel
// Name + identity → one addressable instance
// After `:` → the payload that loaders return for that address
resource Asset(
  id: AssetId,
  locale: Locale
): {
  kind: "Asset"
  id
  title: string
  url: string
}

// Same identity family, polymorphic payload (discriminated union)
resource Entry(
  id: EntryId,
  locale: Locale
):
  {
    kind: "Hero"
    id
    title: string
    imageId: AssetId
  }
  | {
    kind: "Menu"
    id
    title: string
  }
```

`Entry(id, locale)` addresses the resource. The variants after `:` describe what may come back. `kind` lives on the **payload**, so it does not create a second address — Hero and Menu share the same identity vocabulary.

### Opaque payload leaves

When a payload field (or entire payload root) belongs to an external integration, declare a nominal leaf with `opaque Name;`. Ziel transports the value through resolution and projection without reading, cloning, or serializing it. There is no representation clause in the DSL — no `on json` or similar.

```ziel
opaque RichDocument;
opaque MediaDescriptor;

scalar ArticleId on string;

resource Article(id: ArticleId): {
  id
  title: string
  body: RichDocument
  media?: MediaDescriptor | null
}
```

Opaque types are **payload-only**. They must not appear in identity parameters, query parameters, datasource `context`, or `refers`. They are not inspectable in `when` expressions. Codegen emits a runtime token (`defineOpaqueType`) plus a branded type alias; adapters introduce values with `.wrap`. `unwrap` defaults to `unknown` (re-parse if needed); trusted callers can assert the loader-validated shape with `unwrap<Wire>(value)`. Optional multi-token bridges use `createOpaqueRegistry` (separate from `ContentRegistry`). Full DSL and runtime notes: [`packages/ziel` README](https://github.com/xndrjs/toolkit/tree/main/packages/ziel).

### ARI identity

An **ARI** (Addressable Resource Identifier) names **one** resource instance: resource type + identity fields. In TypeScript that instance’s canonical string is `resource.toString()` — the in-process and cache key unless you invent a separate presentation encoding outside Ziel. The wire form is `Type(field=value,...)` with lexicographic fields and JSON scalar encoding:

```ts
import { ari, s } from "@xndrjs/ziel";

const entryAri = ari("Entry", s.object({ id: s.string(), locale: s.string() }));

const entry = entryAri({ id: "hero-1", locale: "en" });

entry.toString();
// Entry(id="hero-1",locale="en")
```

Please note:

- Secrets (tokens, credentials) should **never** be identity or cache dimensions.
- Semantic audience / tenant / market / locale belong in identity (or execution context) when they change which payload you get.

### `refers` marks a relationship

Payload fields may refer another resource’s identity. Mark those fields with `refers`:

```ziel
resource Page(
  id: EntryId,
  locale: Locale
): {
  id
  title: string
  // Participates in a relationship with Entry — does not fetch it.
  strips: { id: EntryId }[] refers Entry
  // `refers` may include a `with` arm to narrow the expected target payload variant.
  menuId: EntryId refers Entry with { kind: "Menu" }
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
    kind: "Menu"
    id
    title: string
  }
```

`refers Entry` means “this value is about an Entry.” Optional `with { … }` narrows the expected payload variant when you already know it (here: menu should be a Menu). Neither form schedules IO. Traversal stays explicit in the query.

A reference also does **not** have to contain a complete target identity. It may supply only part of the key; the query fills the rest from the source identity or query parameters when it constructs the target ARI. For example, `menuId` is only an `EntryId` — the Entry’s `locale` comes from the Page identity via `@p.locale` at expand time:

```ziel
expand menu: Entry(
  id: p.menuId,      // from Page payload
  locale: @p.locale  // from Page identity — not stored on the reference
) on failure set null
```

### Queries walk the graph explicitly

A **query** chooses a root ARI and, for each resource family you may encounter, what to project and which neighbors to load (`expand`). That is the local-traversal law in practice: a payload field typed `R[]` is an array of values, not an implicit fan-out to `R` resources.

```ziel
query PageDetail(
  pageId: EntryId,
  locale: Locale
) {
  context {
    locale
  }

  // First ARI to load — built from query inputs
  root Page(
    id: pageId,
    locale: locale
  )

  // Once Page's payload is available (`p`), name edges and build child ARIs
  on Page p include properties {
    expand menu: Entry(
      id: p.menuId,        // from Page payload
      locale: @p.locale    // from Page identity (`@` = identity / context)
    ) on failure set null

    // `each` makes one-to-many explicit — projected `strips` is an array
    expand strips: each stripLink in p.strips (
      Entry(
        id: stripLink.id,
        locale: @p.locale
      ) on failure set null
    )
  }

  on Entry e include properties {
    // see `when` below
    default { }
  }

  on Asset a include properties { }
}
```

`expand menu` both names the relationship in the aggregate and constructs the child ARI. Identity pieces can come from the parent payload (`p.menuId`) or from the parent’s own identity (`@p.locale`).

### `when` arms narrow polymorphic payloads

When a payload is a union, fields exist only on some variants. **`when`** arms narrow the payload before you read those fields or expand from them:

```ziel
on Entry e include properties {
  when e.kind == "Hero" {
    expand image: Asset(
      id: e.imageId,       // valid only on Hero
      locale: @e.locale
    ) on failure set null
  }

  when e.kind == "Menu" {
    // no further edges for Menu in this query
  }

  default { }
}
```

Without `when`, referring to `e.imageId` on a generic Entry would be unsound — Menus have no `imageId`.

### `resolve to` redirects through intermediate resources

Some resources exist only to **compute the next address**. A classic case is an encoded locator string: you load it, inspect a small decode payload, then continue as the real Entry or Asset. The intermediate should not leak into the application aggregate.

```ziel
scalar CustomReferenceValue on string;

// Locator resource: load → decode payload (not the final aggregate type)
resource CustomReference(
  ref: CustomReferenceValue,
  locale: Locale
):
  {
    kind: "Entry"
    id: EntryId refers Entry
  }
  | {
    kind: "Asset"
    id: AssetId refers Asset
  }

// After CustomReference is loaded, continue as Entry or Asset
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

Projection follows the redirect and places the canonical Entry/Asset under the original expand alias. Redirect chains compress to one target; aliases share the same payload. Redirect **cycles** abort resolution — a cycle is a broken graph, not a missing child.

### Failure stays on the edge

- The **root** always throws if it cannot load — there is no aggregate without a root.
- Each **child** `expand` may declare `on failure` (`throw` | `set null` | `set error`); the default is `throw`. Soft policies (`set null`, `set error`) keep the walk going; they populate a global `errors` collection while the projected field becomes `null` or a JSON-safe failure value.
- If the same ARI is reached through multiple edges, the **strictest** failure policy wins.
- Redirect cycles are **not** softened by `on failure` — they remain structural errors, so they always throw.
- Datasource routing is **first-match**: declare one owner per ARI family (optionally refined with a `when` on the route that can see identity/context, not payload).

```ziel
expand menu: Entry(
  id: p.menuId,
  locale: @p.locale
) on failure set null   // missing menu → null, query continues

expand related: Entry(
  id: p.relatedId,
  locale: @p.locale
) on failure set error  // missing related → failure value in field + entry in `errors`

expand mustHave: Entry(
  id: p.requiredId,
  locale: @p.locale
) on failure throw      // missing required child → abort (default)
```

### Islands, backing cache, and serialization

These rules matter once you cache or reuse subgraphs; they do not change how resources and expands work.

- An **island** is a named subgraph boundary (declared in the query), not a cache implementation. Membership (resources inside the island) and dependencies (edges to other islands) are distinct. Prefer lifecycle / reuse boundaries (shared chrome, independently cached slices) over an island on every node: the language does not forbid one-island-per-resource, but that is **not** the intended model. Each boundary records inter-island dependency edges and multiplies membership bookkeeping when the same ARI is reachable from many islands — fine-grained islands turn that cost into the dominant shape of the walk.
- A typical use is a large editorial graph, for example CMS-driven websites where many `Page` roots share the same menu and footer. Declaring those as separate islands lets you cache chrome once and keep each page island dependent on it, instead of storing a redundant menu/footer copy inside every page graph. That reuse is an **optional** optimization — omit island boundaries when a single cached aggregate is simpler.
- **`backingResources`** are opaque pre-resolved payloads the engine may consult before calling sources. The map is never mutated; promoted keys are reported separately. Freshness, TTL, and invalidation stay in application infrastructure.
- **`SerializedIsland` schema v1** is the portable island envelope. Projected JavaScript object cycles are a separate concern from graph visitation (the walk already dedupes by ARI).

## Runtime budgets

Every resolve has finite defaults (nodes, edges, batches, duration). Override per execution via resolver / generated façade `budget`. Crossing a limit aborts with `ResourceGraphBudgetExceededError` and `onBudgetExceeded`. Details: [Resource graph resolver](/v0/resource-orchestration/resource-graph-resolver/).

## Operational runbook

### Limits

- Set `budget` for production topologies (lower than defaults for small pages; raise only with evidence).
- Forward `signal` into loaders so deadline abort cancels in-flight HTTP.
- Watch `onBudgetExceeded` / `ResourceGraphBudgetExceededError` in logs and APM.

### Observer

- Use `ResolutionObserver` for batch timing, misses, expansions, and budget events.
- Observer callbacks must not throw into the walk (failures are swallowed); keep them side-effect safe.

### Loaders

- Validate **untrusted** transport payloads inside `load` before returning; the engine trusts `load` results.
- Keep secrets and HTTP clients in closures / DI — not in Ziel `context`.
- One datasource owner per ARI family; `sources` order is first-match.

### Cache / islands

- Serialize with `serializeAllIslands` only after a successful resolve you intend to cache.
- Key caches by island id + your own schema / query fingerprint; do not put secrets in keys.
- On incident: compare `contentMap` vs `islands` vs `islandDependencies` — membership ≠ dependency.

## License

MIT — see the monorepo root.
