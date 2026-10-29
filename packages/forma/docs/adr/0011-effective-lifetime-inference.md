# 0011. Graph-derived effective Provider lifetimes

## Status

Accepted

## Context

Forma originally treated an unmodified Provider as composition-lifetime and rejected a direct
dependency on `.perContext()`. The invariant was correct — a root-owned factory must not capture
an operation owned by one execution context — but the remedy was not ergonomic. Every consumer
on the transitive path had to repeat `.perContext()`, so a deep graph produced iterative errors and
duplicated information already available to the Composition.

The Composition now builds and validates a closed, acyclic execution plan before it exposes the
root. Root and execution contexts already have separate lifecycle owners, caches, inflight maps,
signals, cleanup buckets, and terminal state machines. The plan is therefore the appropriate seam
for deriving ownership once.

## Decision

Separate a Provider's declared lifetime policy from its effective lifetime:

```ts
type LifetimePolicy = "auto" | "context" | "composition";
type EffectiveLifetime = "context" | "composition";
```

- no modifier declares `auto`;
- `.perContext<ParamsReq>()` declares exact context ownership and optionally grants typed access
  to execution params;
- `.perComposition()` declares exact root ownership.

For every `auto` Provider, the Composition chooses the longest lifetime compatible with the
resolved dependency graph. With the current two owners:

```text
effective(P) = context      when P is declared context
effective(P) = context      when any transitive dependency is effective context
effective(P) = composition  otherwise
```

A `.perComposition()` Provider whose transitive dependency graph requires context ownership is a
composition error. The diagnostic includes a causal path to the `.perContext()` Provider.

Intent aliases are resolved as graph edges before lifetime derivation, so context ownership also
propagates through alias-mediated dependencies. The graph is already acyclic; lifetime derivation
is a single dependencies-first traversal in `O(V + E)`.

Owner, `AbortSignal`, cache, inflight Promise, cleanup bucket, and disposal all follow the
effective lifetime. Factory params do not: only a Provider that explicitly declares
`.perContext<ParamsReq>()` receives typed `params`. An `auto` Provider narrowed to context receives
the context-owned `Lifetime.signal` and cleanup ownership without gaining ambient params
capability.

`root.describePlan()` exposes a read-only list of declared and effective Provider lifetimes. For
an `auto` Provider narrowed to context it also includes the causal Intent path.

The runtime planner is authoritative. TypeScript provides a best-effort error for the direct
`.perComposition() -> .perContext()` conflict; transitive and alias-mediated conflicts fail
synchronously at `compose()`.

## Consequences

- `.perContext()` is declared only where context affinity originates, not repeated on every
  consumer.
- A Provider recipe may be composition-effective in one Composition and context-effective in
  another. Use `.perComposition()` when shared identity, state, setup frequency, or cancellation
  semantics are an invariant rather than an optimization.
- Adding a context dependency may narrow an `auto` Provider and change setup/cleanup frequency.
  `describePlan()` and explicit pins make that decision inspectable.
- Params inference remains based on explicit `.perContext<ParamsReq>()` declarations and is not
  propagated through consumer generics.
- ADR 0004's earlier rejection of implicit promotion as out of scope is superseded by this
  decision; its root/context state-machine ownership remains unchanged.
