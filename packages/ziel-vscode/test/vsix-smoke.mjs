import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

import AdmZip from "adm-zip";

const packageRoot = new URL("..", import.meta.url);
const vsixPath = fileURLToPath(new URL("artifacts/ziel-vscode.vsix", packageRoot));

function frame(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

function createProtocol(child) {
  let buffer = Buffer.alloc(0);
  const messages = [];
  const waiters = new Set();

  const flushWaiters = () => {
    for (const waiter of waiters) {
      const match = messages.find(waiter.predicate);
      if (match) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve(match);
      }
    }
  };

  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = buffer.subarray(0, headerEnd).toString("ascii");
      const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1]);
      if (!Number.isFinite(length)) throw new Error(`Invalid LSP header: ${header}`);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) return;
      const message = JSON.parse(buffer.subarray(bodyStart, bodyStart + length).toString("utf8"));
      buffer = buffer.subarray(bodyStart + length);

      if (message.id !== undefined && message.method) {
        const result = message.method === "workspace/configuration" ? [] : null;
        child.stdin.write(frame({ jsonrpc: "2.0", id: message.id, result }));
      } else {
        messages.push(message);
        flushWaiters();
      }
    }
  });

  return {
    send(message) {
      child.stdin.write(frame({ jsonrpc: "2.0", ...message }));
    },
    waitFor(predicate, label, timeoutMs = 10_000) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            reject(new Error(`Timed out waiting for ${label}`));
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
  };
}

test("the packaged VSIX starts its bundled server and validates a multi-file project", async (t) => {
  const archive = new AdmZip(vsixPath);
  const entries = archive.getEntries().map((entry) => entry.entryName);

  assert(entries.includes("extension/dist/extension.js"));
  assert(entries.includes("extension/dist/server.js"));
  assert(entries.includes("extension/package.json"));
  assert(!entries.some((entry) => entry.startsWith("extension/node_modules/")));

  const unpacked = mkdtempSync(join(tmpdir(), "ziel-vsix-"));
  const project = mkdtempSync(join(tmpdir(), "ziel-vsix-project-"));
  t.after(() => {
    rmSync(unpacked, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  });
  archive.extractAllTo(unpacked, true);

  const packagedManifest = JSON.parse(
    readFileSync(join(unpacked, "extension", "package.json"), "utf8")
  );
  assert.equal(packagedManifest.main, "./dist/extension.js");

  const resourcesPath = join(project, "resources.ziel");
  const queryPath = join(project, "query.ziel");
  const querySource = `
query PostDetail(postId: PostId) {
  context { locale: Locale }
  root Post(id: postId, locale: context.locale)
  on Post post {
    id
    id
  }
}
`;
  writeFileSync(
    resourcesPath,
    `
scalar PostId on string;
scalar Locale on string;
resource Post(id: PostId, locale: Locale): { id title: string }
`
  );
  writeFileSync(queryPath, querySource);
  writeFileSync(join(project, "ziel.config.mjs"), `export default { include: ["**/*.ziel"] };\n`);

  let stderr = "";
  const child = spawn(
    process.execPath,
    [join(unpacked, "extension", "dist", "server.js"), "--stdio"],
    { cwd: project, stdio: ["pipe", "pipe", "pipe"] }
  );
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  t.after(() => {
    if (!child.killed) child.kill();
  });

  const protocol = createProtocol(child);
  const rootUri = pathToFileURL(project).href;
  const queryUri = pathToFileURL(queryPath).href;
  protocol.send({
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri,
      capabilities: { workspace: { configuration: true, workspaceFolders: true } },
      workspaceFolders: [{ uri: rootUri, name: "ziel-vsix-smoke" }],
    },
  });

  const initialized = await protocol
    .waitFor((message) => message.id === 1, "initialize response")
    .catch((error) => {
      throw new Error(`${error.message}\nServer stderr:\n${stderr}`);
    });
  assert.equal(initialized.error, undefined, stderr);
  assert.equal(typeof initialized.result?.capabilities, "object");

  protocol.send({ method: "initialized", params: {} });
  protocol.send({
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: queryUri, languageId: "ziel", version: 1, text: querySource },
    },
  });

  const published = await protocol.waitFor(
    (message) =>
      message.method === "textDocument/publishDiagnostics" &&
      message.params?.uri === queryUri &&
      message.params.diagnostics?.some(
        (diagnostic) => diagnostic.code === "DUPLICATE_SELECTED_FIELD"
      ),
    "multi-file diagnostics"
  );
  assert(
    !published.params.diagnostics.some((diagnostic) => diagnostic.code === "UNKNOWN_RESOURCE"),
    `The packaged server did not resolve the resource from the sibling file.\n${stderr}`
  );

  protocol.send({ id: 2, method: "shutdown", params: null });
  await protocol.waitFor((message) => message.id === 2, "shutdown response");
  protocol.send({ method: "exit", params: null });
});
