import http from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ArchitectureGraphDocument } from "../config/define-config";
import type { ArchitectureGraph, ArchitectureId, ArchitectureViewSchema } from "../graph/types";
import { toReactFlowGraph } from "../projection/to-react-flow-graph";
import type { ArchitectureViewState, ReactFlowProjectionOptions } from "../projection/types";
import { cleanArchitecturePreset } from "../presets/clean-architecture";

export interface ViewerServerOptions {
  document: ArchitectureGraphDocument;
  schema?: ArchitectureViewSchema;
  host?: string;
  port?: number;
  assetRoot?: string;
}

export interface ViewerServer {
  url: string;
  close: () => Promise<void>;
}

export async function startViewerServer(options: ViewerServerOptions): Promise<ViewerServer> {
  const schema = options.schema ?? cleanArchitecturePreset;
  const viewState = createDeterministicViewState(options.document.graph, schema);
  const projectionOptions: ReactFlowProjectionOptions = {
    graph: options.document.graph,
    schema,
    viewState,
  };
  const projection = toReactFlowGraph(projectionOptions);
  const graphJson = serializeJson(options.document);
  const projectionJson = serializeJson(projection);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4317;
  const assetRoot = options.assetRoot ?? resolveDefaultAssetRoot();

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}`);

    if (url.pathname === "/") {
      respond(response, 200, "text/html; charset=utf-8", createViewerHtml());
      return;
    }

    if (url.pathname === "/assets/viewer.js") {
      void respondWithAsset(
        response,
        path.join(assetRoot, "viewer.js"),
        "text/javascript; charset=utf-8"
      );
      return;
    }

    if (url.pathname === "/assets/viewer.css") {
      void respondWithAsset(
        response,
        path.join(assetRoot, "viewer.css"),
        "text/css; charset=utf-8"
      );
      return;
    }

    if (url.pathname === "/graph.json") {
      respond(response, 200, "application/json; charset=utf-8", graphJson);
      return;
    }

    if (url.pathname === "/projection.json") {
      respond(response, 200, "application/json; charset=utf-8", projectionJson);
      return;
    }

    respond(response, 404, "text/plain; charset=utf-8", "Not found\n");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const url = `http://${formatHost(address.address)}:${address.port}/`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

function createDeterministicViewState(
  graph: ArchitectureGraph,
  schema: ArchitectureViewSchema
): ArchitectureViewState {
  const lanesById = new Map(schema.lanes.map((lane) => [lane.id, lane]));
  const boxesByLane = new Map<string, ArchitectureId[]>();
  const boxPositions: NonNullable<ArchitectureViewState["boxPositions"]> = {};
  const nodePositions: NonNullable<ArchitectureViewState["nodePositions"]> = {};

  for (const box of graph.boxes) {
    const laneBoxes = boxesByLane.get(box.laneId) ?? [];
    laneBoxes.push(box.id);
    boxesByLane.set(box.laneId, laneBoxes);
  }

  const sortedBoxes = [...graph.boxes].sort((left, right) => {
    const leftLane = lanesById.get(left.laneId)?.order ?? Number.MAX_SAFE_INTEGER;
    const rightLane = lanesById.get(right.laneId)?.order ?? Number.MAX_SAFE_INTEGER;

    return (
      leftLane - rightLane ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id)
    );
  });

  for (const box of sortedBoxes) {
    const laneOrder = lanesById.get(box.laneId)?.order ?? 1;
    const laneBoxes = boxesByLane.get(box.laneId) ?? [];
    const laneIndex = laneBoxes.sort().indexOf(box.id);

    boxPositions[box.id] = {
      x: 64 + (laneOrder - 1) * 360,
      y: 80 + Math.max(laneIndex, 0) * 260,
    };
  }

  for (const node of graph.nodes) {
    const siblings = graph.nodes
      .filter((candidate) => candidate.boxId === node.boxId)
      .sort(
        (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
      );
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);

    nodePositions[node.id] = {
      x: 24,
      y: 56 + Math.max(siblingIndex, 0) * 48,
    };
  }

  return { boxPositions, nodePositions };
}

function respond(
  response: http.ServerResponse,
  statusCode: number,
  contentType: string,
  body: string
): void {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(body);
}

async function respondWithAsset(
  response: http.ServerResponse,
  assetPath: string,
  contentType: string
): Promise<void> {
  try {
    const body = await readFile(assetPath, "utf8");
    respond(response, 200, contentType, body);
  } catch {
    respond(response, 404, "text/plain; charset=utf-8", "Viewer asset not found\n");
  }
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function formatHost(host: string): string {
  return host === "::" ? "localhost" : host;
}

function resolveDefaultAssetRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(currentDir, "viewer"), path.join(currentDir, "../../dist/viewer")];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

function createViewerHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gordio Viewer</title>
    <link rel="stylesheet" href="/assets/viewer.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/viewer.js"></script>
  </body>
</html>`;
}
