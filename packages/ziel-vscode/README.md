# Ziel VS Code / Cursor extension

Syntax highlighting, language configuration, and an LSP client for `.ziel` files: **diagnostics**, **hover**, **completion**, **go to definition**, **quick fixes**, and **Format Document** (same `parseAndCheck` / `checkProgram` rules as codegen). The extension bundles the Ziel language server and all of its runtime dependencies.

**Extension ID:** `xndrjs.ziel-vscode`

## Install

### From a marketplace (after publish)

- **Cursor** (Open VSX): search **Ziel**, or install `xndrjs.ziel-vscode`
- **VS Code** (Visual Studio Marketplace): search **Ziel**, or install `xndrjs.ziel-vscode`

### From a `.vsix` (local / CI artifact)

```bash
cd packages/ziel-vscode
pnpm run vsix   # builds the client, then packages
cursor --install-extension ./ziel-vscode-0.0.1.vsix
# or: code --install-extension ./ziel-vscode-0.0.1.vsix
```

Then reload the window (`Developer: Reload Window`). The VSIX is self-contained; projects using the extension do not need to install or build `@xndrjs/ziel`.

### From Location (dev)

1. `pnpm --filter ziel-vscode build`
2. Command Palette → **Extensions: Install from Location…** → select this folder → reload.

### F5 (Extension Development Host)

1. Build the extension with `pnpm --filter ziel-vscode build`.
2. Open the monorepo, **or** use a launch config with  
   `"args": ["--extensionDevelopmentPath=${workspaceFolder}/packages/ziel-vscode"]`.
3. Press **F5**.
4. Open any `.ziel` file (e.g. `apps/ziel-demo/ziel/queries/page-detail.ziel`).

After editing the TextMate grammar or language configuration, reload the Extension Development Host. After editing `src/extension.ts`, rebuild (`pnpm run build`) then reload.

## What it colors

- Keywords: `scalar`, `resource`, `fragment`, `query`, `context`, `root`, `roots`, `on`, `resolve`, `to`, `expand`, `each`, `in`, `not`, `and`, `or`, `when`, `islands`, `refers`, `include`, `all`, `properties` (and `with` inside a `refers` clause)
- Primitives: `string`, `number`, `boolean`
- Strings, numbers, `true` / `false` / `null`
- Operators: `==`, `!=`, `!`, `...`, `|`
- Comments: `//` and `/* */`
- Coarse type/identifier scopes (PascalCase → type-like)

## Diagnostics

On open/change of `.ziel` files, the language server looks upward for `ziel.config.ts` (or `.js` / `.mjs`). With a config, it collects that project’s set (same `include` / `exclude` as codegen), merges programs, and publishes syntax + semantic squiggles. Without a config, only the open file is checked — there is no workspace-root `**/*.ziel` fallback (avoids false duplicates across unrelated packages in a monorepo).

## IntelliSense

Hover, completion, and go to definition read the same multi-file semantic snapshot as diagnostics (merged IR + scalar/resource tables).

| Feature              | Behavior                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hover**            | Scalars (`scalar EntryId on string`), resources (identity + payload), fields, selected projection fields, expression path segments, and island `when` paths             |
| **Completion**       | Type positions (scalar + resource names); `on` / construction / `refers` / islands targets (resources); projection body fields; construction args; island binding paths |
| **Go to definition** | Jump to scalar, resource, and (best-effort) field declarations via IR/AST spans (including islands `on` resources)                                                      |
| **Quick fixes**      | Add missing `on` projections (individually or together), an empty `context`, or an empty `roots` block from the corresponding diagnostic                                |
| **Format Document**  | Langium `AbstractFormatter` in the language server (2-space indent by default; respects editor `tabSize` / `insertSpaces`). Range formatting included.                  |

Keywords still come from the Langium grammar follow-set. Rename and find-references are not implemented yet.

## Publishing

See [PUBLISHING.md](./PUBLISHING.md) for Visual Studio Marketplace and Open VSX steps. Always **build before** packaging a `.vsix`.
