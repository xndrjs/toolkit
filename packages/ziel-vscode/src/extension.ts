import { existsSync } from "node:fs";
import { join } from "node:path";

import { window, workspace, type ExtensionContext } from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

function resolveLanguageServerModule(context: ExtensionContext): string {
  const serverModule = context.asAbsolutePath(join("dist", "server.js"));
  if (!existsSync(serverModule)) {
    throw new Error(`Bundled Ziel language server not found at ${serverModule}.`);
  }
  return serverModule;
}

export async function activate(context: ExtensionContext): Promise<void> {
  let serverModule: string;
  try {
    serverModule = resolveLanguageServerModule(context);
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
