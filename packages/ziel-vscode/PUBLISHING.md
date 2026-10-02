# Publishing Ziel to VS Code Marketplace and Open VSX

This extension is identified as **`xndrjs.ziel-vscode`** (`publisher` + `name` in `package.json`).

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
4. **Build before packaging:** `pnpm run build` (or `pnpm run vsix`, which builds first). The extension client is `dist/extension.js`; its bundled language server is `dist/server.js`.

### Language server and `.vsix`

The build emits both the extension client and a self-contained language server. The client resolves `dist/server.js` through VS Code's `ExtensionContext`, so a packaged extension has no runtime dependency on the monorepo or on an application-installed `@xndrjs/ziel` package.

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

## Build a `.vsix`

From this package directory:

```bash
# from monorepo root (also runs via build:packages)
pnpm run build:packages

# or only this package
cd packages/ziel-vscode
pnpm run vsix
# → builds dist/extension.js + dist/server.js, then artifacts/ziel-vscode.vsix
```

`--no-dependencies` is intentional: `vscode-languageclient`, Ziel, Langium, and the server's remaining dependencies are compiled into the two `dist` artifacts. Only VS Code's own `vscode` module remains external.

Install locally for a smoke test:

```bash
# Cursor
cursor --install-extension ./ziel-vscode-0.0.1.vsix

# VS Code
code --install-extension ./ziel-vscode-0.0.1.vsix
```

Then reload the window and open a `.ziel` file. Diagnostics and IntelliSense work directly from the installed VSIX.

---

## Publish to Visual Studio Marketplace (VS Code)

```bash
cd packages/ziel-vscode

# Using a PAT for this session
export VSCE_PAT=<your-azure-devops-marketplace-pat>

npm run publish:vscode
# equivalent:
# pnpm run build && npx @vscode/vsce publish --no-dependencies
```

Or publish a prebuilt VSIX:

```bash
npx @vscode/vsce publish --packagePath ./ziel-vscode-0.0.1.vsix -p "$VSCE_PAT"
```

After publish, the extension appears at:

`https://marketplace.visualstudio.com/items?itemName=xndrjs.ziel-vscode`

---

## Publish to Open VSX (Cursor)

```bash
cd packages/ziel-vscode

export OVSX_PAT=<your-open-vsx-token>

# Package + publish from package.json
npm run publish:ovsx
# equivalent:
# pnpm run build && npx ovsx publish --no-dependencies
```

Or publish a prebuilt VSIX:

```bash
npx ovsx publish ./ziel-vscode-0.0.1.vsix -p "$OVSX_PAT"
```

After publish, the extension appears at:

`https://open-vsx.org/extension/xndrjs/ziel-vscode`

Cursor’s Extensions view indexes Open VSX; search for **Ziel** or `xndrjs.ziel-vscode`. Indexing can take a few minutes.

---

## Recommended release checklist

1. Update `version` in `package.json`.
2. Update `README.md` if user-facing behavior changed.
3. `pnpm run test:vsix` (build, package, stdio handshake, and multi-file diagnostic smoke test); optionally smoke-test the resulting VSIX in Cursor and/or VS Code.
4. Publish to Open VSX (`npm run publish:ovsx`) if Cursor users need the release.
5. Publish to VS Marketplace (`npm run publish:vscode`) if VS Code users need the release.
6. Tag the release in git if your monorepo workflow expects it (optional).

---

## Common failures

| Symptom                                         | Fix                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Namespace / publisher not found                 | Create or claim `xndrjs` on the target store                        |
| Unauthorized / 401                              | Regenerate PAT/token; check `VSCE_PAT` / `OVSX_PAT`                 |
| Version already exists                          | Bump `version` and rebuild                                          |
| `private: true` blocked publish                 | Keep `private` unset (this package is publishable)                  |
| Missing LICENSE                                 | Keep the `LICENSE` file in this folder                              |
| Missing `dist/extension.js` or `dist/server.js` | Run `pnpm run build` before `vsce` / `ovsx`                         |
| No diagnostics / server missing                 | Rebuild or reinstall the VSIX; both artifacts are packaged together |

---

## Local development (not marketplace)

- **Extension Development Host**: build this package, open the monorepo and launch with `--extensionDevelopmentPath` pointing at this folder (F5), or open this folder alone and press F5.
- **Install from Location**: Command Palette → _Extensions: Install from Location…_ → select this folder → reload.
- **Symlink** into `~/.cursor/extensions/xndrjs.ziel-vscode-<version>` (or `~/.vscode/extensions/...`) then reload.

Do **not** pass a bare folder path to `cursor --install-extension` / `code --install-extension`; those CLIs expect a marketplace ID or a `.vsix` file.
