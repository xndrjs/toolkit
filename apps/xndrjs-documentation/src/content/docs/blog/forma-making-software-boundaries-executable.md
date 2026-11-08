---
title: "Forma: making software boundaries executable"
description: How explicit boundaries, contracts, and composition make a TypeScript codebase easier to navigate and evolve—for humans and coding agents alike.
date: 2026-11-06
author: Fabio Fognani
tags:
  - typescript
  - architecture
  - ai
  - forma
---

Over the past year, I have reviewed much AI-generated code that often looked perfectly reasonable, in isolation. Then, after enough iterations, I would try to make a small change by hand and realize that I wasn't feeling confident about it.

The codebase had not necessarily turned into spaghetti. But changing, introducing, or removing a feature meant editing several parts of it, some obvious and others much less so. I often expected TypeScript to keep those points aligned, but encoding every relevant relationship in the type system was not always possible. Some connections remained implicit, and I had to remember where they were.

I could find all the impacted pieces of code by search. But I realized I no longer carried a compact model of the system in my head.

That feeling started to grow uncomfortable on me. Humans do not understand a system as a list of grep results. We need concepts that compress it: a few centers of gravity that tell us where to look.

This pushed me toward a narrower design question: could some of those concepts become explicit and executable?

Could the code tell us

- who owns a capability?
- what that capability promises?
- how it is realized?
- where architectural spaces meet?
- which realizations form one running application?

## Locally correct pull requests can still produce global drift

AI did not invent architectural drift: teams were already capable of spreading one decision across handlers, repositories, modules, configuration, and dependency injection code.

What AI changes is the rate at which this can happen. Even with a solo developer.

When producing another local implementation is cheap, there is less immediate pressure to stop and find the stable concept behind it. A pull request can introduce one more type, one more mapping, or one more direct dependency without looking obviously wrong. The cost becomes visible only after many individually acceptable decisions have accumulated.

I have started using three informal names for the failure mode I observe. They are not intended as universal terminology. They are working definitions based on my own experience.

**AI shotgun** is what happens when one conceptual change becomes many distributed edits. The agent can find and update them quickly, so the dispersion does not hurt immediately. But those locations must remain synchronized in every later change.

**AI amnesia** is the loss of the human mental map. I may have read and reviewed every generated change, yet the speed of production — and the decision to delegate part of the design — means I do not retain where responsibilities ended up or which path connects them.

**AI lock-in** follows from the first two. Once I am no longer confident that a local edit is actually local, I delegate even small changes back to the agent. Not because the code is impossible to understand, and not because I am locked into a particular model vendor, but because navigating the distributed consequences manually has become too expensive.

The loop reinforces itself: delegation increases throughput; throughput increases distributed change; distributed change weakens the mental model; and the weaker mental model makes further delegation feel necessary.

![A reinforcing loop connects velocity, AI shotgun, distributed knowledge, AI amnesia, growing delegation, and AI lock-in around locally correct pull requests.](../../../assets/blog/forma/ai-feedback-loop.png)

_AI-assisted velocity does not create architectural drift, but it can reinforce a loop that makes distributed knowledge increasingly difficult to own without further delegation._

I explored the broader relationship between AI and cognitive compression in [AI doesn't make Domain-Driven Design less important. It makes it essential](/blog/ai-makes-domain-driven-design-essential/).

The relevant point here is narrower: if architecture exists only as a convention reconstructed from implementation details, both humans and agents have to rediscover it for every task.

## Architecture is also information compression

A good boundary becomes a compression point.

It says that a coherent set of capabilities and contracts has an owner. It gives the rest of the system a place to refer to that ownership without knowing every implementation detail behind it. When a responsibility moves, the boundary also gives us something precise to discuss: did its implementation move, did its meaning move, or did another part of the system merely acquire a similar need?

This is not automatically guaranteed by putting files in a directory. A package can contain an internally tangled collection of responsibilities, and a coherent architectural boundary can span several packages. Filesystem structure helps people see isolation, but it is only one possible representation of it.

The question that led to Forma was therefore not “how should these folders be arranged?” It was: what is the smallest executable model that can make architecture explicit and enforced?

## From a boundary to an executable promise

In Forma, a **Boundary** owns a language. An Orders boundary can speak about order identifiers, orders, and expected failures such as `not_found`. A SQLite boundary can speak about statements, rows, and database error codes. Similar TypeScript shapes do not make those concepts identical.

A boundary is “closed” because it owns an identifiable vocabulary and makes external capabilities explicit. Closure does not imply isolation or a dedicated package.

Ownership alone is not enough. A caller also needs a stable way to say what it wants without importing the implementation that currently provides it. Forma calls that stable promise an **Intent**. Its contract fixes the input, successful value, and expected error in the Boundary's own language:

```ts
import { boundary } from "@xndrjs/forma";

type SitemapEntry = {
  readonly location: string;
  readonly lastModifiedAt: string;
};
type GeneratedSitemap = { readonly entries: readonly SitemapEntry[] };

export const Sitemap = boundary("sitemap");

export const EnumerateSitemapEntries = Sitemap.intent("enumerateSitemapEntries").contract<
  void,
  readonly SitemapEntry[],
  never
>();

export const GenerateSitemapUseCase = Sitemap.intent("generateSitemapUseCase").contract<
  void,
  GeneratedSitemap,
  never
>();
```

`EnumerateSitemapEntries` is the lower-level port Sitemap needs. `GenerateSitemapUseCase` is the use case we eventually want to expose. Both are Intents because both need a stable identity and a replaceable realization; neither says whether the entries come from memory, a CMS snapshot, a database, or a remote service. Neither operation currently declares an expected error, hence `never`. The next question is how Forma handles failures that the contract did not anticipate.

### The part TypeScript cannot put in a function signature

Input, success, and expected error may look like a complete contract, but TypeScript leaves one exit untyped. `Promise<T>` describes the value with which a Promise can be fulfilled; it does not declare the values with which that Promise may reject. A synchronous function has the same limitation: its signature cannot express the set of exceptions it may throw.

This turns exception handling into a discovery problem. To handle a rejection deliberately, the caller has to know which exceptions can emerge from the entire stack below the call: the current Provider, its dependencies, a database driver, a remote SDK, a parser, or any other implementation detail involved along the way. A `catch` does not recover that missing contract. It receives `unknown`, and TypeScript cannot tell us which cases are meaningful.

The architectural risk is larger than missing type information. An Orders use case may start catching a PostgreSQL error code because the current realization happens to use PostgreSQL, even though the database lives several layers below Orders. The code may work, but the caller has crossed the Boundary to interpret infrastructure vocabulary. Replacing the realization can then change the exceptions that escape without changing the Intent's signature.

A Boundary can deliberately translate a technical failure into an expected error when callers are meant to act on it. That error becomes data and appears in the Intent's contract. What the Boundary cannot classify must not escape as another implicitly supported branch that every caller has to rediscover.

Forma therefore **totalizes** accepted Boundary invocations. A Provider throw or Promise rejection is captured before it leaves the Boundary and represented as an `unexpectedFailure`; success, expected errors, and cancellation are represented alongside it in the same `InvocationOutcome`. The unexpected cause remains on the diagnostic side of the Boundary, while callers receive only an opaque failure identity that they can report or propagate without interpreting it as domain data.

An error that crosses a Boundary as something callers may handle must be catalogued by that Boundary. Everything else remains unexpected without becoming invisible.

This guarantee concerns accepted Boundary invocations. Composition and disposal failures remain lifecycle exceptions rather than application outcomes.

### From contracts back to execution

With the error semantics established, we can return to the sitemap example. The Intents above still cannot execute. The use case needs a realization, and that realization needs a way to declare its dependency on the private port. A **Provider** supplies both: it says how one Intent is realized and lists the other Intents required to build that realization. `using` makes this dependency subgraph visible before any code runs:

```ts
export const GenerateSitemapProvider = GenerateSitemapUseCase.provide
  .using({ enumerateEntries: EnumerateSitemapEntries })
  .with(({ deps: { enumerateEntries }, out }) => {
    return async function generateSitemap() {
      const outcome = await enumerateEntries();

      switch (outcome.kind) {
        case "success":
          return out.success({ entries: outcome.value });
        default:
          return outcome;
      }
    };
  });
```

The `out` value constructs outcomes valid for this Intent's contract. Unexpected Failure and Cancellation are already represented by Forma, so the `default` branch propagates them without trying to reinterpret them inside Sitemap.

Declaring Providers still does not answer which realization a particular application should use. A test may use memory while production uses a CMS; two realizations of the same Intent cannot both be the answer inside one running graph. The application therefore needs one unit that selects a coherent set of Providers, verifies that every required Intent is satisfied, and owns the resulting runtime. Forma calls that unit a **Composition**.

A Composition distinguishes selected public operations — its **Surface** — from private dependency wiring, and declares which **Entry Boundaries** are allowed to own Surface roots.

The separation of concerns is the following:

- the Boundary owns the language;
- the Intent owns the contract;
- the Provider owns one realization;
- the Composition owns one executable graph.

Forma is therefore not a global registry where any caller can ask for any service. Before returning an executable root, a Composition rejects incomplete graphs, competing realizations, and cycles, then assumes runtime ownership of the selected Providers.

This is where Forma differs in emphasis from ordinary dependency injection. Dependency injection primarily answers how a dependency reaches a consumer. Forma first asks who owns the capability, which Intent represents it, and through which declared relationship it may cross into another architectural space. A DI container can still be a useful implementation mechanism; it simply does not necessarily preserve these distinctions by itself.

## When two boundaries need to collaborate

Boundaries are useful only if they can collaborate without silently collapsing into one language.

Forma gives that collaboration an explicit identity: an **Adapter** realizes an Intent owned by a target Boundary, by using Intents from other Boundaries. It is the place where input, successful values, and expected errors can be translated.

Suppose Page Builder needs to resolve a page without adopting Routing's contract directly. It owns a local Intent named `ResolvePage`: it accepts `{ pageId }`, returns a Page Builder `PageLocation`, and reports `page_not_found`. Routing instead resolves batches: `ResolvePaths` accepts `{ pageIds }`, returns a list of `ResolvedPath` values, and reports `route_not_found` for the page it could not resolve.

The concepts are related, but they are not the same. The error translation also needs to be explicit: the Adapter knows how to map `route_not_found` into `page_not_found`, so Page Builder doesn't have to mix its language with Routing's. Static types make the known mapping exhaustive, but a runtime integration can still violate its declared contract. The Adapter maps the known code and converts any uncatalogued code into an opaque Unexpected Failure rather than leaking it as a Page Builder error. Unexpected Failures and Cancellations already produced downstream pass through unchanged:

```ts
const PageBuilderRouting = adapter("page-builder-routing", PageBuilder);

export const ResolvePageViaRoutingProvider = PageBuilderRouting.adapt(ResolvePage)
  .using({ resolvePaths: ResolvePaths })
  .with(
    ({ deps: { resolvePaths }, out }) =>
      async function resolvePage(page) {
        const outcome = await resolvePaths({ pageIds: [page.pageId] });

        switch (outcome.kind) {
          case "success": {
            const resolved = outcome.value[0];
            return resolved
              ? out.success({
                  id: resolved.pageId,
                  canonicalPath: resolved.canonicalPath,
                })
              : out.unexpectedFailure();
          }
          case "expectedError":
            switch (outcome.error.code) {
              case "route_not_found":
                return out.expectedError({ code: "page_not_found" });
              default:
                return out.unexpectedFailure();
            }
          default:
            return outcome;
        }
      }
  );
```

The Adapter is not a generic mapper added because two interfaces fail to line up. It records an architectural statement: Page Builder's local need is currently realized through Routing. If either side evolves, the translation remains localized instead of leaking into both Boundaries.

![The Page Builder Routing Adapter realizes Page Builder's Resolve Page Intent by using Routing's batched Resolve Paths Intent and explicitly maps input, success, and expected error values between their contracts.](../../../assets/blog/forma/adapter-semantic-bridge.png)

_An Adapter is an architectural bridge, not just a shape converter: it records which local Intent it realizes, which external Intent it uses, and how meaning crosses the Boundary._

## Boundaries can be discovered after the system starts moving

The most useful boundaries are not always obvious at the beginning of a project.

Consider a CMS-driven editorial system. Initially, Sitemap needs to obtain the entries it will publish. That dependency lives behind a private `EnumerateSitemapEntries` Intent. This is a good design: Sitemap asks for what it needs in its own language, and there is no evidence yet that either path resolution or page enumeration deserves an independent architectural identity.

Later, Page Builder needs to resolve editorial paths to create page previews and resolve internal links.

Several locally reasonable options now exist. Page Builder could call Sitemap's public use case, but then it would depend on vocabulary and behavior intended for sitemap generation. It could resolve paths independently, but route rules, failure mapping, and CMS translation could drift. Or both could import the same helper, which shares code without answering who owns the capability.

The new pressure reveals something that was not true, or at least not useful, before: resolving editorial paths has acquired meaning independent from Sitemap.

That is the moment a `Routing` Boundary becomes valuable.

Routing now owns `ResolvePaths`. Sitemap still keeps `EnumerateSitemapEntries`, while Page Builder keeps `ResolvePage`; Adapters let both consumers reach Routing without adopting its contract as their own.

![Path resolution begins inside Sitemap. When Page Builder also needs it, the capability moves into a dedicated Routing Boundary and both consumers connect through Adapters.](../../../assets/blog/forma/progressive-boundary-discovery.png)

_Boundary discovery is a change of ownership, not a demand for early prediction. The precise Intent and Provider wiring remains in code; the architectural move is that path resolution gains an independent owner._

Then another requirement arrives. A migration or verification script needs to enumerate every published page, but it does not need sitemap entries and may not need paths at all. Reusing Sitemap would give the script vocabulary and behavior belonging to sitemap generation; independently querying the CMS would duplicate the knowledge of what counts as published content.

This second consumer reveals another capability that had previously looked like an implementation detail of Sitemap: the system has a catalog of published pages. That is the moment a small `ContentCatalog` Boundary becomes useful. It owns `EnumeratePublishedPages`, which returns page identities and modification timestamps without deciding how those pages will be presented or routed.

Sitemap still keeps its local `EnumerateSitemapEntries` port. Its Adapter now obtains the published pages from ContentCatalog, asks Routing to resolve their canonical paths, and combines both results into Sitemap entries. The migration or verification flow can use ContentCatalog without depending on Sitemap, while Routing continues to resolve paths without knowing why they were requested.

## A use case should not need to be rewritten as a port

In many Ports and Adapters implementations, the two roles also receive different forms in code. A port is represented as an interface, while a use case is represented as a function or callable service. The diagram below makes that conventional mapping explicit:

![A conventional mapping represents a port as an interface and a use case as a function.](../../../assets/blog/forma/port-use-case-separate-representations.png)

_When role and representation coincide, moving an operation from local use case to external port can also require changing its shape in code._

This is a reasonable mapping, but it makes the representation carry an architectural decision. An operation implemented locally is a function; if the system later shows that its realization belongs behind another Boundary, the operation may need to be split into an interface and an injected implementation. Its meaning may be stable, yet the code has to be recast from use case into port.

Forma takes a different route:

![Boundary A contains a use-case Intent realized by Provider A. That Provider uses a second local Intent as a port. An Adapter realizes the port through Intent C, which is owned and realized by Provider C inside Boundary B.](../../../assets/blog/forma/forma-intent-realization-graph.png)

_The Adapter changes where the local port is realized without changing the Intent used by its Boundary._

Forma keeps role separate from representation. Both use cases and ports are Intents: stable identities and contracts for operations expressed in the language of their Boundary. An Intent is not declared as one role or the other, and the roles do not have different types. Its role depends on where its realization lives: a same-Boundary Provider makes it a use case, while a realization from outside the Boundary makes it a port.

In the diagram, `INTENT A` is realized locally by `PROVIDER A`, so it plays the role of a use case. The same Provider declares `INTENT B` through `using`; because that second Intent is realized outside Boundary A, it plays the role of a port.

The Adapter realizes `INTENT B` through `INTENT C`, whose Provider belongs to Boundary B. Boundary A does not adopt Boundary B's contract, and its Provider continues to depend on the same local Intent.

An Intent can therefore start with a same-Boundary Provider. If the system later reveals a more appropriate owner, an Adapter can realize that same local Intent through an Intent belonging to the new Boundary. Consumers keep depending on the original identity and contract; the Composition changes how that promise is fulfilled.

The architectural property I want is not perfect foresight: it is the ability to keep an operation's identity and contract stable while moving its realization to the Boundary that proves to be its natural owner.

The use case does not have to be dismantled and reinvented as a port. Its Intent remains in place while Providers and Adapters make the new ownership explicit.

## Composition makes the current answer inspectable

After extracting Routing and ContentCatalog, the declarations still describe several possible pieces rather than one application. We need to choose the public use cases, authorize the Boundaries from which public traversal may begin, and keep the internal Boundaries, infrastructure, and Adapters reachable only as dependencies.

The [Editorial demo](https://github.com/xndrjs/toolkit/tree/develop/apps/forma-demo/src/editorial) chooses `generateSitemap` and `createPagePreview` as its Surface. Their Providers belong to Sitemap and Page Builder, so those are its Entry Boundaries. ContentCatalog, Routing, the CMS snapshot, and the Adapters remain private `wiring`. The demo uses a committed snapshot so it can run without credentials; a production root could realize the same Intents through a CMS, a database, or a remote service.

The Composition is where that answer becomes explicit:

```ts
export function composeEditorial() {
  return compose({
    entryBoundaries: [Sitemap, PageBuilder],
    surface: {
      generateSitemap: GenerateSitemapProvider,
      createPagePreview: CreatePagePreviewProvider,
    },
    wiring: [
      EnumerateSitemapEntriesViaCatalogAndRoutingProvider,
      ResolvePageViaRoutingProvider,
      EnumeratePublishedPagesViaCmsSnapshotProvider,
      ResolvePathsViaCmsSnapshotProvider,
      ReadSnapshotProvider,
    ],
  });
}
```

![The generateSitemap Surface operation reaches the Sitemap use-case Provider, whose local port is realized by an Adapter using ContentCatalog to enumerate published pages and Routing to resolve their paths.](../../../assets/blog/forma/forma-model-anatomy.png)

_The Adapter realizes Sitemap's local port by combining two external Intents; it does not wrap their Providers. The Composition independently selects the Providers behind ContentCatalog and Routing._

The private Providers are required to execute the Surface, but they do not become accidental entry points themselves.

A compiled graph would still be a poor mental map if only Forma could see it. `describePlan()` exposes a read-only description of the Composition: where public traversal begins, which operations form the Surface, which Provider realizations were selected, whether they came from a Boundary or an Adapter, and how their resources are owned. It turns the running application's architectural choices into inspectable data without materializing the Providers.

That description can be given directly to an agent as task context. For a task such as “add a field to the page preview”, the plan shows that `createPagePreview` is a public Page Builder operation and identifies the Boundary and Adapter origins that participate in this application. The agent still has to read the relevant contracts and implementation, but it starts from a bounded architectural map instead of reconstructing one from arbitrary imports across the repository.

<!-- Illustration note: a dedicated diagram could show a task entering through one Surface operation, then using describePlan() to narrow the agent's search to named Boundaries and Adapter origins. -->

## The patterns that emerge

Once ownership and wiring have executable identities, several design moves become less dramatic.

### A Provider can move without moving the Intent

An implementation can move from memory to SQLite, from a CMS SDK to an internal service, or from one orchestration strategy to another. If the meaning and contract remain stable, consumers still depend on the same Intent. Composition selects the new realization.

### A capability can acquire its own Boundary

Routing did not need to exist before the second consumer exposed independent meaning. Once that happened, Forma provided a place to move the realization and explicit connections through which existing consumers could migrate.

The same extraction is possible with ordinary code. The difference is the surface of the change. If the operation's identity, contract, and realization are embodied by the same function, moving the capability can also require introducing a port, changing how dependencies are passed, and updating the consumers that previously called the function directly. With Forma, the consumer-owned Intent can remain stable while its realization moves behind an Adapter to the new Boundary.

I think of this as a **dynamic seam**: not runtime service lookup, but a Boundary crossing introduced when the system provides evidence that it is useful. The realization moves outside the original Boundary; the local identity and contract do not have to move with it.

### A runtime change can remain an application detail

A Boundary can describe a capability such as cookies, local storage, persistence, or remote data access without forcing its consumer to know whether the current realization runs in a browser, server process, test, or worker. Changing runtime is not automatically free—the contracts must still be honest—but the point of change becomes explicit and replaceable.

For example, a Cookies Boundary can keep the same Intent while a browser Composition selects a realization backed by browser cookies and a server Composition selects one backed by the request and response. Consumers depend on the capability rather than either runtime API.

### Public traversal remains deliberate

The Surface is not a catalogue of everything registered in the graph. It exposes selected Providers owned by declared Entry Boundaries. Infrastructure and Adapters remain reachable through dependencies without becoming public shortcuts.

## What Forma does and does not do

These patterns are possible without Forma. A disciplined team can encode them through modules, factories, naming conventions, dependency rules, and careful review. Forma's value is to give the most important relationships a small common interface and make the resulting graph reject invalid states before execution.

Once ownership and realization are explicit, the runtime can coordinate resource lifetimes, keep uncatalogued failures from escaping Boundary invocations, and clean up streaming work coherently. The [technical documentation](/v0/application-architecture/forma/) covers those runtime policies in detail.

Forma does not replace domain modeling, Clean Architecture, or thoughtful repository structure.

It does not decide which Boundaries an application should have. It cannot tell us whether Routing has genuinely acquired independent meaning. What it can do is preserve that decision once we make it, and make it explicit.

## From memory to an executable model

The answer to AI shotgun is not to prohibit distributed changes. Some changes are inherently distributed. The answer to AI amnesia is not to expect people to memorize every generated patch. And the answer to AI lock-in is not to stop using agents.

The more useful response is to give both humans and agents a stronger map.

TypeScript is a general-purpose language; it has no first-class notion of an architectural Boundary. Any module can depend on any other, so preserving levels of abstraction — and deciding where one vocabulary stops — is left to us. Orders speaks about orders and business failures; PostgreSQL speaks about queries, rows, and database failures. The two have to collaborate, but their languages should not bleed into each other. Forma makes those spaces explicit, represents their crossings as Adapters, and lets the Composition record which realizations form the application that runs today.

Boundaries then become centers of gravity for the code that shares a language, while Intents keep the identity and contract of an operation separate from its current realization. This is broader than a DDD Bounded Context: PostgreSQL is not a domain model and does not acquire the same semantic role as Orders, but both are first-class architectural spaces in a Forma Composition. One speaks the language of the business and the other the language of infrastructure; the important part is not to mistake one for the other.

Forma cannot keep those languages clean on our behalf. It will not prevent an Orders Intent from talking about a database row, a cookie, or `localStorage`. Once the Boundary is explicit, however, that vocabulary appears in a contract that claims to belong to Orders. The mismatch becomes visible enough that it should make us ask whether the operation belongs there or whether an Adapter is missing.

Choosing where those lines belong remains a design decision. Once we draw them, Forma can keep their contracts, crossings, and selected realizations explicit in the application.

The library is currently alpha. Its [technical documentation](/v0/application-architecture/forma/) describes the implemented API, guarantees, lifecycle, error protocol, streaming model, and current limitations.
