# 0014. Nominal Providers and runtime branding

## Status

Accepted

## Context

`Provider` exposed its executable factory and an optional `$params` phantom property. That made an
internal materialization hook look like supported public metadata, enlarged the semver surface,
enabled tests and callers to replace the factory by object spread, and left Provider construction
structural. Boundary validation likewise accepted lookalike objects in runtime paths that could not
rely on TypeScript.

Forma needs public descriptors that can be inspected for architectural metadata while keeping
execution and inference machinery under the ownership of the builders and composition runtime.
Runtime values also need to remain recognizable when compatible copies of the package coexist.

## Decision

- The public Provider metadata is exactly `intent`, `deps`, `origin`, and `lifetimePolicy`.
  `factory` and `$params` are not public properties or public accessors.
- `Provider` carries a required non-exported `unique symbol` type brand. Its payload preserves the
  full Contract, deps, policy, Params, modality, and origin for internal conditional-type
  inference, so callers cannot construct a Provider structurally.
- The executable realization is held in a frozen internal record behind a non-exported symbol.
  Internal constructor, authenticity predicate, and materialization accessor own that seam; no
  public test helper reopens it.
- Runtime recognition uses versioned global symbols (`Symbol.for`). Compatible package copies can
  recognize values created by one another without putting modality or Contract in canonical
  identity.
- Provider, origin, dependency records, Intent values, declarators/builders, Boundary values, and
  Adapter values are shallow-frozen when created.
- Boundary and Intent runtime values use the same versioned-brand approach where runtime protocol
  validation is required. Entry Boundary and Adapter-target validation is nominal.
- Runtime branding is protocol provenance and interoperability, not a security barrier. Code that
  can execute in the process can discover or reproduce global symbols and must not be treated as
  untrusted solely because a brand check passes.

## Consequences

- Provider behavior is exercised through `compose` rather than by invoking or monkey-patching a
  factory. Materialization counts, gates, failures, and cleanup are declared inside `.with`.
- Public metadata remains readable and precisely typed while the executable seam can evolve
  without becoming part of the package API.
- Object spread no longer creates a valid Provider, at either the type level or ordinary runtime
  validation.
- This is an intentional alpha breaking change. There is no deprecated property, compatibility
  overload, or structural fallback.
