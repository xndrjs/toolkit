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

const BOX_TOP_OFFSET = 80;
const BOX_LEFT_OFFSET = 64;
const BOX_ROW_GAP = 260;
const LANE_GAP = 80;
const SLOT_COLUMN_WIDTH = 260;
const NODE_LEFT_OFFSET = 24;
const NODE_TOP_OFFSET = 56;
const NODE_ROW_GAP = 48;
const BOX_MIN_WIDTH = 280;
const NODE_MIN_WIDTH = 232;
const NODE_HORIZONTAL_PADDING = 36;
const TEXT_CHARACTER_WIDTH = 8;

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
  const boxesById = new Map(graph.boxes.map((box) => [box.id, box]));
  const boxKindsById = new Map(schema.boxKinds.map((boxKind) => [boxKind.id, boxKind]));
  const nodeKindsById = new Map(schema.nodeKinds.map((nodeKind) => [nodeKind.id, nodeKind]));
  const activeSlotColumnsByBoxId = createActiveSlotColumnsByBoxId(
    graph,
    boxesById,
    boxKindsById,
    nodeKindsById
  );
  const boxWidthsById = createBoxWidthsById(
    graph,
    boxesById,
    boxKindsById,
    nodeKindsById,
    activeSlotColumnsByBoxId
  );
  const boxesByLane = new Map<string, ArchitectureId[]>();
  const boxPositions: NonNullable<ArchitectureViewState["boxPositions"]> = {};
  const nodePositions: NonNullable<ArchitectureViewState["nodePositions"]> = {};

  for (const box of graph.boxes) {
    const laneBoxes = boxesByLane.get(box.laneId) ?? [];
    laneBoxes.push(box.id);
    boxesByLane.set(box.laneId, laneBoxes);
  }

  const laneOffsetsById = createLaneOffsetsById(schema, boxesByLane, boxWidthsById);

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
    const laneBoxes = boxesByLane.get(box.laneId) ?? [];
    const laneIndex = laneBoxes.sort().indexOf(box.id);

    boxPositions[box.id] = {
      x: laneOffsetsById.get(box.laneId) ?? BOX_LEFT_OFFSET,
      y: BOX_TOP_OFFSET + Math.max(laneIndex, 0) * BOX_ROW_GAP,
    };
  }

  for (const node of graph.nodes) {
    const slotId = getNodeSlotId(node, boxesById, boxKindsById, nodeKindsById);
    const slotColumn = activeSlotColumnsByBoxId.get(node.boxId)?.get(slotId) ?? 0;
    const siblings = graph.nodes
      .filter(
        (candidate) =>
          candidate.boxId === node.boxId &&
          getNodeSlotId(candidate, boxesById, boxKindsById, nodeKindsById) === slotId
      )
      .sort(
        (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
      );
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);

    nodePositions[node.id] = {
      x: NODE_LEFT_OFFSET + slotColumn * SLOT_COLUMN_WIDTH,
      y: NODE_TOP_OFFSET + Math.max(siblingIndex, 0) * NODE_ROW_GAP,
    };
  }

  return { boxPositions, nodePositions };
}

function createLaneOffsetsById(
  schema: ArchitectureViewSchema,
  boxesByLane: Map<string, ArchitectureId[]>,
  boxWidthsById: Map<ArchitectureId, number>
): Map<string, number> {
  const offsetsById = new Map<string, number>();
  let nextX = BOX_LEFT_OFFSET;

  for (const lane of [...schema.lanes].sort((left, right) => left.order - right.order)) {
    const boxIds = boxesByLane.get(lane.id) ?? [];
    const laneWidth = Math.max(
      0,
      ...boxIds.map((boxId) => boxWidthsById.get(boxId) ?? BOX_MIN_WIDTH)
    );

    offsetsById.set(lane.id, nextX);
    nextX += laneWidth + LANE_GAP;
  }

  return offsetsById;
}

function createBoxWidthsById(
  graph: ArchitectureGraph,
  boxesById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  boxKindsById: Map<string, ArchitectureViewSchema["boxKinds"][number]>,
  nodeKindsById: Map<string, ArchitectureViewSchema["nodeKinds"][number]>,
  activeSlotColumnsByBoxId: Map<ArchitectureId, Map<string, number>>
): Map<ArchitectureId, number> {
  return new Map(
    graph.boxes.map((box) => {
      const childNodes = graph.nodes.filter((node) => node.boxId === box.id);
      const slotColumns = activeSlotColumnsByBoxId.get(box.id);
      const maxChildRight = Math.max(
        0,
        ...childNodes.map((node) => {
          const slotId = getNodeSlotId(node, boxesById, boxKindsById, nodeKindsById);
          const slotColumn = slotColumns?.get(slotId) ?? 0;
          return NODE_LEFT_OFFSET + slotColumn * SLOT_COLUMN_WIDTH + getNodeWidth(node.title);
        })
      );

      return [box.id, Math.max(BOX_MIN_WIDTH, maxChildRight + NODE_LEFT_OFFSET)];
    })
  );
}

function getNodeWidth(title: string): number {
  return Math.max(NODE_MIN_WIDTH, title.length * TEXT_CHARACTER_WIDTH + NODE_HORIZONTAL_PADDING);
}

function createActiveSlotColumnsByBoxId(
  graph: ArchitectureGraph,
  boxesById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  boxKindsById: Map<string, ArchitectureViewSchema["boxKinds"][number]>,
  nodeKindsById: Map<string, ArchitectureViewSchema["nodeKinds"][number]>
): Map<ArchitectureId, Map<string, number>> {
  const slotIdsByBoxId = new Map<ArchitectureId, Set<string>>();

  for (const node of graph.nodes) {
    const slotId = getNodeSlotId(node, boxesById, boxKindsById, nodeKindsById);
    const slotIds = slotIdsByBoxId.get(node.boxId) ?? new Set<string>();
    slotIds.add(slotId);
    slotIdsByBoxId.set(node.boxId, slotIds);
  }

  return new Map(
    [...slotIdsByBoxId.entries()].map(([boxId, slotIds]) => [
      boxId,
      new Map(
        [...slotIds]
          .sort(
            (left, right) =>
              getSlotOrder(boxId, left, boxesById, boxKindsById) -
                getSlotOrder(boxId, right, boxesById, boxKindsById) || left.localeCompare(right)
          )
          .map((slotId, index) => [slotId, index])
      ),
    ])
  );
}

function getNodeSlotId(
  node: ArchitectureGraph["nodes"][number],
  boxesById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  boxKindsById: Map<string, ArchitectureViewSchema["boxKinds"][number]>,
  nodeKindsById: Map<string, ArchitectureViewSchema["nodeKinds"][number]>
): string {
  const box = boxesById.get(node.boxId);
  const boxKind = box ? boxKindsById.get(box.kind) : undefined;
  const nodeKind = nodeKindsById.get(node.kind);
  const slotId = node.slot ?? nodeKind?.defaultSlot;
  const slot = boxKind?.slots.find((candidate) => candidate.id === slotId);

  return slot?.id ?? slotId ?? "default";
}

function getSlotOrder(
  boxId: ArchitectureId,
  slotId: string,
  boxesById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  boxKindsById: Map<string, ArchitectureViewSchema["boxKinds"][number]>
): number {
  const box = boxesById.get(boxId);
  const boxKind = box ? boxKindsById.get(box.kind) : undefined;

  return boxKind?.slots.find((slot) => slot.id === slotId)?.order ?? Number.MAX_SAFE_INTEGER;
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
