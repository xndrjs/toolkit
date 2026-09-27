# NaviQL VS Code / Cursor extension

Syntax highlighting, language configuration, and an LSP client for `.naviql` files: **diagnostics**, **hover**, **completion**, **go to definition**, and **Format Document** (same `parseAndCheck` / `checkProgram` rules as codegen). The extension stays thin (`LanguageClient`); IntelliSense and formatting live in `@xndrjs/naviql`’s language server.

**Extension ID:** `xndrjs.naviql-vscode`

## Prerequisites (diagnostics)

The LanguageClient starts `@xndrjs/naviql`’s `naviql-language-server` (`dist/lsp/main.js`). Build that package first:

```bash
pnpm --filter @xndrjs/naviql build
pnpm --filter naviql-vscode build
```

F5 / **Install from Location** in this monorepo resolve the server via the workspace dependency. A marketplace `.vsix` does not yet bundle the server binary (absolute path / packaging TBD — see [PUBLISHING.md](./PUBLISHING.md)).

## Install

### From a marketplace (after publish)

- **Cursor** (Open VSX): search **NaviQL**, or install `xndrjs.naviql-vscode`
- **VS Code** (Visual Studio Marketplace): search **NaviQL**, or install `xndrjs.naviql-vscode`

### From a `.vsix` (local / CI artifact)

```bash
cd packages/naviql-vscode
pnpm run vsix   # builds the client, then packages
cursor --install-extension ./naviql-vscode-0.0.1.vsix
# or: code --install-extension ./naviql-vscode-0.0.1.vsix
```

Then reload the window (`Developer: Reload Window`). Note: a vsix built with `--no-dependencies` includes the client only; for live diagnostics prefer F5 or Install from Location in the monorepo (with `@xndrjs/naviql` built).

### From Location (dev)

1. `pnpm --filter @xndrjs/naviql build && pnpm --filter naviql-vscode build`
2. Command Palette → **Extensions: Install from Location…** → select this folder → reload.

### F5 (Extension Development Host)

1. Build both packages (see Prerequisites).
2. Open the monorepo, **or** use a launch config with  
   `"args": ["--extensionDevelopmentPath=${workspaceFolder}/packages/naviql-vscode"]`.
3. Press **F5**.
4. Open any `.naviql` file (e.g. `apps/naviql-demo/naviql/page-detail.naviql`).

After editing the TextMate grammar or language configuration, reload the Extension Development Host. After editing `src/extension.ts`, rebuild (`pnpm run build`) then reload.

## What it colors

- Keywords: `scalar`, `resource`, `fragment`, `query`, `context`, `root`, `roots`, `on`, `resolve`, `to`, `expand`, `each`, `in`, `not`, `and`, `or`, `when`, `islands`, `refers`, `include`, `all`, `properties` (and `with` inside a `refers` clause)
- Primitives: `string`, `number`, `boolean`
- Strings, numbers, `true` / `false` / `null`
- Operators: `==`, `!=`, `!`, `...`, `|`
- Comments: `//` and `/* */`
- Coarse type/identifier scopes (PascalCase → type-like)

## Diagnostics

On open/change of `.naviql` files, the language server looks upward for `naviql.config.ts` (or `.js` / `.mjs`). With a config, it collects that project’s set (same `include` / `exclude` as codegen), merges programs, and publishes syntax + semantic squiggles. Without a config, only the open file is checked — there is no workspace-root `**/*.naviql` fallback (avoids false duplicates across unrelated packages in a monorepo).

## IntelliSense

Hover, completion, and go to definition read the same multi-file semantic snapshot as diagnostics (merged IR + scalar/resource tables).

| Feature              | Behavior                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hover**            | Scalars (`scalar EntryId on string`), resources (identity + payload), fields, selected projection fields, expression path segments, and island `when` paths             |
| **Completion**       | Type positions (scalar + resource names); `on` / construction / `refers` / islands targets (resources); projection body fields; construction args; island binding paths |
| **Go to definition** | Jump to scalar, resource, and (best-effort) field declarations via IR/AST spans (including islands `on` resources)                                                      |
| **Format Document**  | Langium `AbstractFormatter` in the language server (2-space indent by default; respects editor `tabSize` / `insertSpaces`). Range formatting included.                  |

Keywords still come from the Langium grammar follow-set. Rename, find-references, and code actions are not implemented yet.

## Publishing

See [PUBLISHING.md](./PUBLISHING.md) for Visual Studio Marketplace and Open VSX steps. Always **build before** packaging a `.vsix`.
