import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { window, workspace, type ExtensionContext } from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

const require = createRequire(__filename);

/**
 * Resolve `@xndrjs/ziel`’s stdio language-server entry (`dist/lsp/main.js`).
 * Monorepo / Install-from-Location: workspace dependency.
 * Packaged `.vsix`: ship or point at an absolute server path (see PUBLISHING.md).
 */
function resolveLanguageServerModule(): string {
  let lspIndex: string;
  try {
    lspIndex = require.resolve("@xndrjs/ziel/lsp");
  } catch {
    throw new Error(
      "Could not resolve @xndrjs/ziel/lsp. Add the workspace dependency and run pnpm install."
    );
  }

  const serverModule = join(dirname(lspIndex), "main.js");
  if (!existsSync(serverModule)) {
    throw new Error(
      `Ziel language server not found at ${serverModule}. Build it first: pnpm --filter @xndrjs/ziel build`
    );
  }
  return serverModule;
}

export async function activate(_context: ExtensionContext): Promise<void> {
  let serverModule: string;
  try {
    serverModule = resolveLanguageServerModule();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    void window.showErrorMessage(`Ziel: ${message}`);
    return;
  }

  const serverOptions: ServerOptions = {
    run: {
      command: process.execPath,
      args: [serverModule],
      transport: TransportKind.stdio,
    },
    debug: {
      command: process.execPath,
      args: ["--nolazy", "--inspect=6009", serverModule],
      transport: TransportKind.stdio,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "ziel" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.ziel"),
    },
  };

  client = new LanguageClient("ziel", "Ziel Language Server", serverOptions, clientOptions);
  await client.start();
}

export async function deactivate(): Promise<void> {
  if (client === undefined) {
    return;
  }
  await client.stop();
  client = undefined;
}
