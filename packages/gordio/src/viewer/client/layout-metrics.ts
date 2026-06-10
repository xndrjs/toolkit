import type { ReactFlowGraph } from "../../projection/types";

const BOX_MIN_WIDTH = 280;
const BOX_MIN_HEIGHT = 180;
const BOX_PADDING_Y = 14;
const BOX_TITLE_LINE_HEIGHT = 20;
const BOX_TITLE_MARGIN_BOTTOM = 4;
const BOX_META_LINE_HEIGHT = 12;
const BOX_TOGGLE_SIZE = 28;
const BOX_BOTTOM_PADDING = 32;
const NODE_ROW_HEIGHT = 42;
const NODE_MIN_WIDTH = 232;
const NODE_HORIZONTAL_PADDING = 36;
const NODE_LEFT_OFFSET = 24;
const TEXT_CHARACTER_WIDTH = 8;

export function getBoxWidth(boxId: string, projection: ReactFlowGraph): number {
  const childNodes = projection.nodes.filter((node) => node.parentId === boxId);
  const maxChildRight = Math.max(
    0,
    ...childNodes.map((node) => node.position.x + getNodeWidth(node.data.node?.title ?? ""))
  );

  return Math.max(BOX_MIN_WIDTH, maxChildRight + NODE_LEFT_OFFSET);
}

export function getCollapsedBoxHeight(options?: { hasPackageName?: boolean }): number {
  const headingHeight = options?.hasPackageName
    ? BOX_TITLE_LINE_HEIGHT + BOX_TITLE_MARGIN_BOTTOM + BOX_META_LINE_HEIGHT
    : BOX_TITLE_LINE_HEIGHT;
  const headerHeight = Math.max(headingHeight, BOX_TOGGLE_SIZE);

  return BOX_PADDING_Y * 2 + headerHeight;
}

export function getBoxHeight(boxId: string, projection: ReactFlowGraph): number {
  const childNodes = projection.nodes.filter((node) => node.parentId === boxId);
  const maxChildBottom = Math.max(
    0,
    ...childNodes.map((node) => node.position.y + NODE_ROW_HEIGHT)
  );

  return Math.max(BOX_MIN_HEIGHT, maxChildBottom + BOX_BOTTOM_PADDING);
}

export function getNodeWidth(title: string): number {
  return Math.max(NODE_MIN_WIDTH, title.length * TEXT_CHARACTER_WIDTH + NODE_HORIZONTAL_PADDING);
}
