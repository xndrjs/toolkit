# NaviQL VS Code / Cursor extension

Syntax highlighting and language configuration for `.naviql` files. No language server yet.

**Extension ID:** `xndrjs.naviql-vscode`

## Install

### From a marketplace (after publish)

- **Cursor** (Open VSX): search **NaviQL**, or install `xndrjs.naviql-vscode`
- **VS Code** (Visual Studio Marketplace): search **NaviQL**, or install `xndrjs.naviql-vscode`

### From a `.vsix` (local / CI artifact)

```bash
cd packages/naviql-vscode
npm run vsix
cursor --install-extension ./naviql-vscode-0.0.1.vsix
# or: code --install-extension ./naviql-vscode-0.0.1.vsix
```

Then reload the window (`Developer: Reload Window`).

### From Location (dev)

Command Palette → **Extensions: Install from Location…** → select this folder → reload.

### F5 (Extension Development Host)

1. Open this folder, **or** use a launch config with  
   `"args": ["--extensionDevelopmentPath=${workspaceFolder}/packages/naviql-vscode"]`.
2. Press **F5**.
3. Open any `.naviql` file (e.g. `apps/demo-naviql/naviql/page-detail.naviql`).

After editing `syntaxes/naviql.tmLanguage.json` or `language-configuration.json`, reload the Extension Development Host (or the main window if installed from a `.vsix` / Location).

## What it colors

- Keywords: `scalar`, `resource`, `query`, `context`, `root`, `on`, `expand`, `each`, `in`, `when`
- Primitives: `string`, `number`, `boolean`
- Strings, numbers, `true` / `false` / `null`
- Operators: `==`, `!=`, `|`
- Comments: `//` and `/* */`
- Coarse type/identifier scopes (PascalCase → type-like)

## Publishing

See [PUBLISHING.md](./PUBLISHING.md) for Visual Studio Marketplace and Open VSX steps.

## Out of scope (for now)

Diagnostics, completion, hover, rename — planned via `@xndrjs/naviql/lsp` later.
