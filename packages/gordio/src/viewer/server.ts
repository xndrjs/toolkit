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
const BOX_VERTICAL_GAP = 80;
const LANE_GAP = 80;
const SLOT_COLUMN_GAP = 48;
const NODE_LEFT_OFFSET = 24;
const NODE_TOP_OFFSET = 56;
const NODE_ROW_HEIGHT = 42;
const NODE_ROW_GAP = 16;
const BOX_BOTTOM_PADDING = 32;
const BOX_MIN_WIDTH = 280;
const BOX_MIN_HEIGHT = 180;
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
  const slotLayoutsByBoxKindId = createSlotLayoutsByBoxKindId(
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
    slotLayoutsByBoxKindId
  );
  const boxHeightsById = createBoxHeightsById(graph, boxesById, boxKindsById, nodeKindsById);
  const boxesByLane = new Map<string, ArchitectureId[]>();
  const boxPositions: NonNullable<ArchitectureViewState["boxPositions"]> = {};
  const boxSizes: NonNullable<ArchitectureViewState["boxSizes"]> = {};
  const nodePositions: NonNullable<ArchitectureViewState["nodePositions"]> = {};

  for (const box of graph.boxes) {
    const laneBoxes = boxesByLane.get(box.laneId) ?? [];
    laneBoxes.push(box.id);
    boxesByLane.set(box.laneId, laneBoxes);
  }

  const laneOffsetsById = createLaneOffsetsById(schema, boxesByLane, boxWidthsById);
  const laneWidthsById = createLaneWidthsById(schema, boxesByLane, boxWidthsById);

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
    const sortedLaneBoxes = laneBoxes
      .map((boxId) => boxesById.get(boxId))
      .filter(
        (candidate): candidate is ArchitectureGraph["boxes"][number] => candidate !== undefined
      )
      .sort(
        (left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
      );
    const previousBoxes = sortedLaneBoxes.slice(
      0,
      sortedLaneBoxes.findIndex((candidate) => candidate.id === box.id)
    );
    const previousHeight = previousBoxes.reduce(
      (height, previousBox) => height + (boxHeightsById.get(previousBox.id) ?? BOX_MIN_HEIGHT),
      0
    );
    const previousGaps = Math.max(previousBoxes.length, 0) * BOX_VERTICAL_GAP;

    boxPositions[box.id] = {
      x: laneOffsetsById.get(box.laneId) ?? BOX_LEFT_OFFSET,
      y: BOX_TOP_OFFSET + previousHeight + previousGaps,
    };
    boxSizes[box.id] = {
      width: laneWidthsById.get(box.laneId) ?? boxWidthsById.get(box.id) ?? BOX_MIN_WIDTH,
      height: boxHeightsById.get(box.id) ?? BOX_MIN_HEIGHT,
    };
  }

  for (const node of graph.nodes) {
    const slotId = getNodeSlotId(node, boxesById, boxKindsById, nodeKindsById);
    const box = boxesById.get(node.boxId);
    const slotX = box ? slotLayoutsByBoxKindId.get(box.kind)?.get(slotId)?.x : undefined;
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
      x: slotX ?? NODE_LEFT_OFFSET,
      y: NODE_TOP_OFFSET + Math.max(siblingIndex, 0) * (NODE_ROW_HEIGHT + NODE_ROW_GAP),
    };
  }

  return { boxPositions, boxSizes, nodePositions };
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

function createLaneWidthsById(
  schema: ArchitectureViewSchema,
  boxesByLane: Map<string, ArchitectureId[]>,
  boxWidthsById: Map<ArchitectureId, number>
): Map<string, number> {
  return new Map(
    schema.lanes.map((lane) => {
      const boxIds = boxesByLane.get(lane.id) ?? [];
      const laneWidth = Math.max(
        BOX_MIN_WIDTH,
        ...boxIds.map((boxId) => boxWidthsById.get(boxId) ?? BOX_MIN_WIDTH)
      );

      return [lane.id, laneWidth];
    })
  );
}

function createBoxWidthsById(
  graph: ArchitectureGraph,
  boxesById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  boxKindsById: Map<string, ArchitectureViewSchema["boxKinds"][number]>,
  nodeKindsById: Map<string, ArchitectureViewSchema["nodeKinds"][number]>,
  slotLayoutsByBoxKindId: Map<string, Map<string, SlotLayout>>
): Map<ArchitectureId, number> {
  return new Map(
    graph.boxes.map((box) => {
      const childNodes = graph.nodes.filter((node) => node.boxId === box.id);
      const slotLayouts = slotLayoutsByBoxKindId.get(box.kind);
      const maxChildRight = Math.max(
        0,
        ...childNodes.map((node) => {
          const slotId = getNodeSlotId(node, boxesById, boxKindsById, nodeKindsById);
          const slotLayout = slotLayouts?.get(slotId);
          return (slotLayout?.x ?? NODE_LEFT_OFFSET) + getNodeWidth(node.title);
        })
      );
      const maxSlotRight = Math.max(
        0,
        ...[...(slotLayouts?.values() ?? [])].map((slotLayout) => slotLayout.x + slotLayout.width)
      );

      return [box.id, Math.max(BOX_MIN_WIDTH, maxChildRight, maxSlotRight) + NODE_LEFT_OFFSET];
    })
  );
}

function createBoxHeightsById(
  graph: ArchitectureGraph,
  boxesById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  boxKindsById: Map<string, ArchitectureViewSchema["boxKinds"][number]>,
  nodeKindsById: Map<string, ArchitectureViewSchema["nodeKinds"][number]>
): Map<ArchitectureId, number> {
  return new Map(
    graph.boxes.map((box) => {
      const maxSlotNodeCount = Math.max(
        0,
        ...countNodesBySlot(graph, box.id, boxesById, boxKindsById, nodeKindsById).values()
      );
      const contentHeight =
        NODE_TOP_OFFSET +
        maxSlotNodeCount * NODE_ROW_HEIGHT +
        Math.max(maxSlotNodeCount - 1, 0) * NODE_ROW_GAP +
        BOX_BOTTOM_PADDING;

      return [box.id, Math.max(BOX_MIN_HEIGHT, contentHeight)];
    })
  );
}

function getNodeWidth(title: string): number {
  return Math.max(NODE_MIN_WIDTH, title.length * TEXT_CHARACTER_WIDTH + NODE_HORIZONTAL_PADDING);
}

interface SlotLayout {
  x: number;
  width: number;
}

function createSlotLayoutsByBoxKindId(
  graph: ArchitectureGraph,
  boxesById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  boxKindsById: Map<string, ArchitectureViewSchema["boxKinds"][number]>,
  nodeKindsById: Map<string, ArchitectureViewSchema["nodeKinds"][number]>
): Map<string, Map<string, SlotLayout>> {
  const nodesBySlotByBoxKindId = new Map<string, Map<string, ArchitectureGraph["nodes"]>>();

  for (const node of graph.nodes) {
    const box = boxesById.get(node.boxId);
    if (!box) {
      continue;
    }

    const slotId = getNodeSlotId(node, boxesById, boxKindsById, nodeKindsById);
    const nodesBySlot =
      nodesBySlotByBoxKindId.get(box.kind) ?? new Map<string, ArchitectureGraph["nodes"]>();
    const slotNodes = nodesBySlot.get(slotId) ?? [];
    slotNodes.push(node);
    nodesBySlot.set(slotId, slotNodes);
    nodesBySlotByBoxKindId.set(box.kind, nodesBySlot);
  }

  return new Map(
    [...boxKindsById.values()].map((boxKind) => {
      let nextX = NODE_LEFT_OFFSET;
      const slotLayouts = new Map<string, SlotLayout>();
      const nodesBySlot =
        nodesBySlotByBoxKindId.get(boxKind.id) ?? new Map<string, ArchitectureGraph["nodes"]>();

      for (const slot of [...boxKind.slots].sort(
        (left, right) => left.order - right.order || left.id.localeCompare(right.id)
      )) {
        const slotNodes = nodesBySlot.get(slot.id) ?? [];
        const width = Math.max(
          NODE_MIN_WIDTH,
          ...slotNodes.map((node) => getNodeWidth(node.title))
        );
        slotLayouts.set(slot.id, { x: nextX, width });
        nextX += width + SLOT_COLUMN_GAP;
      }

      return [boxKind.id, slotLayouts];
    })
  );
}

function countNodesBySlot(
  graph: ArchitectureGraph,
  boxId: ArchitectureId,
  boxesById: Map<ArchitectureId, ArchitectureGraph["boxes"][number]>,
  boxKindsById: Map<string, ArchitectureViewSchema["boxKinds"][number]>,
  nodeKindsById: Map<string, ArchitectureViewSchema["nodeKinds"][number]>
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const node of graph.nodes) {
    if (node.boxId !== boxId) {
      continue;
    }

    const slotId = getNodeSlotId(node, boxesById, boxKindsById, nodeKindsById);
    counts.set(slotId, (counts.get(slotId) ?? 0) + 1);
  }

  return counts;
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
