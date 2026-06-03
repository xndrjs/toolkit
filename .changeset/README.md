# Changesets

Operational docs: see **npm releases (stable and alpha)** in the root [`README.md`](../README.md).

To add a release note: `pnpm changeset` from the repository root.

## Never published (stable or alpha)

Workspace packages listed in `ignore` in [`config.json`](./config.json) are excluded from versioning and from `changeset publish` on both **main** and **alpha**. That includes all `apps/*` demos and tooling, for example:

- `@xndrjs/interop-demo` — mixed-validator domain example (Vitest only)
- `@xndrjs/bench-perf` — validation engine benchmark CLI
- `@xndrjs/oas-core-validator-demo`
- `@xndrjs/documentation`

Those apps also set `"private": true` in `package.json` so an accidental `npm publish` is rejected by the registry.

`privatePackages.version` and `privatePackages.tag` are both `false` in [`config.json`](./config.json), so `pnpm changeset version` does not bump versions or changelogs for any private workspace package (apps, shared configs, etc.). The `ignore` list still blocks publish and changeset selection for those names.
