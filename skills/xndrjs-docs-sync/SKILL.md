# xndrjs docs sync

Use this skill when updating package APIs or docs in `apps/xndrjs-documentation` to keep code and documentation aligned.

## Scope

Current documentation scope:

- `@xndrjs/domain`
- `@xndrjs/domain-zod`
- `@xndrjs/domain-ajv`
- `@xndrjs/domain-valibot`
- `@xndrjs/bench-perf` (private workspace package)

Out of scope for this phase:

- deprecated branded package documentation

## Source of truth

Always derive docs from:

1. `packages/*/dist/index.d.ts` (public signatures and exported types)
2. `packages/*/src/*.ts` for behavioral details and error semantics
3. `packages/*/README.md` for CLI usage and benchmark methodology
4. tests/examples for snippet realism:
   - `packages/domain/src/*.test.ts`
   - `packages/domain-zod/src/*.test.ts`
   - `packages/domain-ajv/src/*.test.ts`
   - `packages/domain-valibot/src/*.test.ts`
   - `apps/oas-core-validator-demo` for OpenAPI/AJV workflows

## Required checks before finishing

1. API diff check
   - if exported signatures changed, update the matching docs pages.
2. Navigation check
   - keep versioned docs under `src/content/docs/v0/{getting-started,domain,adapters,...}` (add new doc trees like `v1/` when a stable line ships).
   - keep the splash page at `src/content/docs/index.mdx` and update `astro.config.mjs` sidebar slugs to match (`v0/...`).
3. Naming check
   - user-facing name must be `xndrjs` everywhere.
   - only allowed `xndr` usage: etymology sentence explaining abbreviation from "Alexander".
4. Scope check
   - do not reintroduce pages for out-of-scope packages in this phase.
5. Bench check
   - whenever benchmark commands are documented, mention `@xndrjs/bench-perf` is private and run from monorepo workspace.

## Update workflow

1. Inspect changed package(s) and export surfaces.
2. Map each API change to affected docs pages.
3. Update markdown pages and internal links (`seeAlso`, cross-links).
4. Remove obsolete pages instead of leaving stale content.
5. Run lint/build checks for the docs app and fix issues before handoff.
