# `plop-os`

Scaffolding, codebase Discovery, and explicit Region Sync on top of [Plop](https://plopjs.com/) (“Plop on steroids”).

- **Scaffold generators** are ordinary Plop generators (create files).
- **Discovery** and **Sync** are plop-os: list Candidates from path conventions, then rewrite only marked Region interiors.
- The **filesystem** is the source of truth. There is no identity store, reconciliation, or built-in domain ontology.

Shared vocabulary: [`GLOSSARY.md`](./GLOSSARY.md). A runnable sketch lives in [`examples/minimal/`](./examples/minimal/).

## Install

```bash
pnpm add -D plop-os plop node-plop
```

Peer tooling: use stock `plop` for interactive Scaffold; use the `plop-os` CLI for non-interactive `run` / Discovery / Sync.

## Plopfile

Export a `plopOs` instance (`createPlopOs`) alongside the default Plop function. The CLI loads `plopfile.js|mjs|cjs` from cwd and requires that named export.

```js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPlopOs, plopAddFlags } from "plop-os";

const root = path.dirname(fileURLToPath(import.meta.url));

export const plopOs = createPlopOs({
  roots: [root],
  // optional; defaults include node_modules, dist, .git, coverage
});

plopOs.addDiscoveryRule({
  name: "pkg-models",
  pattern: "packages/:pkgName/models",
  label: ({ data }) => data.pkgName,
});

plopOs.syncGenerator("models-barrel", (ctx) => {
  // return the new Region interior (string). Throw / non-string → whole Sync aborts, no writes.
  return `// regenerated for ${ctx.filePath}\n`;
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

Primary bind mode is a **`path-to-regexp`** pattern (e.g. `packages/:pkgName/models`). Matching directories under `roots` become Candidates (`path`, `label`, `data`). Regex named groups and a custom `(path) => data` function are escape hatches.

Use `plopOs.resolveCandidate(ruleName, inputPath)` inside prompt `validate` so interactive Plop and non-interactive `plop-os run` reject the same bad destinations.

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

## Example

See [`examples/minimal/`](./examples/minimal/) for a copyable workspace: Discovery of `packages/*/models`, a Scaffold generator, and a Sync barrel Region.
