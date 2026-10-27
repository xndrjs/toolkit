# `@xndrjs/plop-os`

Scaffolding, codebase Discovery, and explicit Region Sync on top of [Plop](https://plopjs.com/) (“Plop on steroids”). Not an official Plop package — an xndrjs toolkit on top of it.

**Alpha (`0.1.0-alpha.*`)**: public API may still change without a major bump. Requires Node `>=24 <26` (same engine range as the rest of the toolkit).

- **Scaffold generators** are ordinary Plop generators (create files).
- **Discovery** and **Sync** are `@xndrjs/plop-os`: list Candidates from path conventions, then rewrite only marked Region interiors.
- The **filesystem** is the source of truth. There is no identity store, reconciliation, or built-in domain ontology.

Shared vocabulary: [`GLOSSARY.md`](./GLOSSARY.md). A runnable sketch lives in [`examples/minimal/`](./examples/minimal/).

## Install

```bash
pnpm add -D @xndrjs/plop-os
# interactive Scaffold (optional peer):
pnpm add -D plop
```

`node-plop` ships with this package for non-interactive `plop-os run`. Use stock `plop` for interactive Scaffold; use the `plop-os` CLI for `run` / Discovery / Sync.

## Plopfile

Export a `plopOs` instance (`createPlopOs`) alongside the default Plop function. The CLI loads `plopfile.js|mjs|cjs` from cwd and requires that named export.

```js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlopOs, plopAddFlags } from "@xndrjs/plop-os";

const root = path.dirname(fileURLToPath(import.meta.url));

export const plopOs = createPlopOs({
  roots: [root],
  // optional; defaults include node_modules, dist, .git, coverage
});

const pkgModels = plopOs.addDiscoveryRule({
  name: "pkg-models",
  pattern: "packages/:pkgName/models",
  label: ({ data }) => data.pkgName,
});

plopOs.syncGenerator("models-barrel", (ctx) => {
  // Pass the rule handle so Candidate.data stays typed (path-to-regexp inferred).
  const hits = ctx.discovery.listCandidates(pkgModels);
  return hits.map((c) => `// ${c.data.pkgName}`).join("\n") + "\n";
});

export default function (plop) {
  plop.setGenerator("note", {
    description: "Scaffold a note file",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Name?",
        validate: (v) => (v && /^[a-z0-9-]+$/.test(v) ? true : "kebab-case name required"),
      },
    ],
    actions: [
      {
        type: "add",
        path: "notes/{{name}}.txt",
        template: "hello {{name}}\n",
        ...plopAddFlags("throw"),
      },
    ],
  });
}
```

### Discovery rules

Primary bind mode is a **`path-to-regexp`** pattern (e.g. `packages/:pkgName/models`). Matching **filesystem paths** under `roots` (directories and files) become Candidates (`path`, `label`, `data`, `kind`). `kind` is `"file"` | `"directory"` from the real entry — never guessed from the path string. Regex named groups and a custom `(path) => data` function are escape hatches.

`addDiscoveryRule` returns a typed rule handle — pass it to `candidates` / `resolveCandidate` / Sync `listCandidates` so `data` stays inferred (for regex rules, declare `TData` once on `addDiscoveryRule<…>`). String rule names still work for the CLI.

Use `plopOs.resolveCandidate(ruleHandle, inputPath)` inside prompt `validate` so interactive Plop and non-interactive `plop-os run` reject the same bad destinations.

### Sync markers

Regions are line-bounded, non-nested, balanced markers (`//` or `#`):

```ts
// handwritten preface stays put
// plop-os-sync start models-barrel
// …only this interior is replaced…
// plop-os-sync end models-barrel
```

Sync is **fail-closed**: malformed markers, a missing Sync generator, a throw, or a non-string result abort the pass with **zero writes**.

## Conflict policy

When a Scaffold `add` target already exists: `skip` | `overwrite` | `throw` (conceptual default). Map to Plop flags with `plopAddFlags(policy)`.

Overwrite replaces **that file only**. Existing directories may be reused for children; directories are never wiped recursively.

## CLI

Machine-friendly JSON on stdout; errors as JSON on stderr with a non-zero exit. Never waits on stdin.

```bash
plop-os generators
plop-os candidates --rule <name> [--base <dir>]
plop-os run <scaffoldGenerator> --input '{"name":"..."}'
plop-os sync [--id <syncId>] [--base <dir>]
```

Interactive Scaffold remains stock `plop`.

## Examples

- [`examples/minimal/`](./examples/minimal/) — tiny copyable workspace.
- [`apps/plop-os-demo`](../../apps/plop-os-demo/) — fuller demo with Discovery, Scaffold, Sync, and failure cases (`pnpm --filter @xndrjs/plop-os-demo start`).
