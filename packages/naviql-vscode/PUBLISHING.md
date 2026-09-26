# Publishing NaviQL to VS Code Marketplace and Open VSX

This extension is identified as **`xndrjs.naviql-vscode`** (`publisher` + `name` in `package.json`).

| Store                                                              | Clients                        | Tool           |
| ------------------------------------------------------------------ | ------------------------------ | -------------- |
| [Visual Studio Marketplace](https://marketplace.visualstudio.com/) | VS Code                        | `@vscode/vsce` |
| [Open VSX](https://open-vsx.org/)                                  | Cursor and other VS Code forks | `ovsx`         |

Publishing to one store does **not** publish to the other. For Cursor users, prefer **Open VSX**. For VS Code users, publish to the **Visual Studio Marketplace**.

---

## Prerequisites (once)

### Shared

1. Bump `version` in `package.json` for every release (semver). You cannot republish the same version.
2. Ensure `publisher` is `xndrjs` (or change it everywhere if that namespace is taken).
3. Do not commit marketplace / Open VSX tokens.

### Visual Studio Marketplace

1. Create a [Visual Studio Marketplace publisher](https://marketplace.visualstudio.com/manage) whose **Publisher ID** is `xndrjs`.
2. Create an Azure DevOps [Personal Access Token](https://dev.azure.com) with **Marketplace → Manage** scope.
3. Optionally store it as `VSCE_PAT` in your shell (do not commit it).

### Open VSX

1. Sign in at [open-vsx.org](https://open-vsx.org).
2. Create or claim the namespace **`xndrjs`**: [User settings → Namespaces](https://open-vsx.org/user-settings/namespaces).
3. Create an access token: [User settings → Access Tokens](https://open-vsx.org/user-settings/tokens).
4. Optionally export it as `OVSX_PAT` (do not commit it).

---

## Build a `.vsix` (optional but recommended)

From this package directory:

```bash
cd packages/naviql-vscode
npm run vsix
# → naviql-vscode-<version>.vsix
```

`--no-dependencies` is correct for this grammar-only extension (no runtime `node_modules`).

Install locally for a smoke test:

```bash
# Cursor
cursor --install-extension ./naviql-vscode-0.0.1.vsix

# VS Code
code --install-extension ./naviql-vscode-0.0.1.vsix
```

Then reload the window and open a `.naviql` file.

---

## Publish to Visual Studio Marketplace (VS Code)

```bash
cd packages/naviql-vscode

# Using a PAT for this session
export VSCE_PAT=<your-azure-devops-marketplace-pat>

npm run publish:vscode
# equivalent:
# npx @vscode/vsce publish --no-dependencies
```

Or publish a prebuilt VSIX:

```bash
npx @vscode/vsce publish --packagePath ./naviql-vscode-0.0.1.vsix -p "$VSCE_PAT"
```

After publish, the extension appears at:

`https://marketplace.visualstudio.com/items?itemName=xndrjs.naviql-vscode`

---

## Publish to Open VSX (Cursor)

```bash
cd packages/naviql-vscode

export OVSX_PAT=<your-open-vsx-token>

# Package + publish from package.json
npm run publish:ovsx
# equivalent:
# npx ovsx publish --no-dependencies
```

Or publish a prebuilt VSIX:

```bash
npx ovsx publish ./naviql-vscode-0.0.1.vsix -p "$OVSX_PAT"
```

After publish, the extension appears at:

`https://open-vsx.org/extension/xndrjs/naviql-vscode`

Cursor’s Extensions view indexes Open VSX; search for **NaviQL** or `xndrjs.naviql-vscode`. Indexing can take a few minutes.

---

## Recommended release checklist

1. Update `version` in `package.json`.
2. Update `README.md` if user-facing behavior changed.
3. `npm run vsix` and smoke-test the `.vsix` in Cursor and/or VS Code.
4. Publish to Open VSX (`npm run publish:ovsx`) if Cursor users need the release.
5. Publish to VS Marketplace (`npm run publish:vscode`) if VS Code users need the release.
6. Tag the release in git if your monorepo workflow expects it (optional).

---

## Common failures

| Symptom                         | Fix                                                 |
| ------------------------------- | --------------------------------------------------- |
| Namespace / publisher not found | Create or claim `xndrjs` on the target store        |
| Unauthorized / 401              | Regenerate PAT/token; check `VSCE_PAT` / `OVSX_PAT` |
| Version already exists          | Bump `version` and rebuild                          |
| `private: true` blocked publish | Keep `private` unset (this package is publishable)  |
| Missing LICENSE                 | Keep the `LICENSE` file in this folder              |

---

## Local development (not marketplace)

- **Extension Development Host**: open the monorepo and launch with `--extensionDevelopmentPath` pointing at this folder (F5), or open this folder alone and press F5.
- **Install from Location**: Command Palette → _Extensions: Install from Location…_ → select this folder → reload.
- **Symlink** into `~/.cursor/extensions/xndrjs.naviql-vscode-<version>` (or `~/.vscode/extensions/...`) then reload.

Do **not** pass a bare folder path to `cursor --install-extension` / `code --install-extension`; those CLIs expect a marketplace ID or a `.vsix` file.
