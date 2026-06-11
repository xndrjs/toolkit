import type { VisualState } from "../../projection/types";

const EDGE_BLUE_NORMAL = "#5a7ccf";
const EDGE_BLUE_HIGHLIGHTED = "#2d5fd4";
const EDGE_PURPLE_NORMAL = "#9a6bdb";
const EDGE_PURPLE_HIGHLIGHTED = "#7c4dcc";
const EDGE_GREY_MUTED = "#d0d5de";

export function visualStateClass(visualState: VisualState): string | undefined {
  return visualState === "normal" ? undefined : `gordio-visual-${visualState}`;
}

export function edgeOpacity(visualState: VisualState, rerouted: boolean): number {
  switch (visualState) {
    case "highlighted":
      return 1;
    case "muted":
      return 1;
    default:
      return rerouted ? 0.8 : 0.9;
  }
}

export function edgeStrokeWidth(visualState: VisualState): number {
  switch (visualState) {
    case "highlighted":
      return 3;
    case "normal":
      return 1.5;
    default:
      return 1.5;
  }
}

export function edgeStrokeDasharray(): string {
  return "none";
}

export function edgeStrokeColor(visualState: VisualState, kind?: string): string {
  if (visualState === "highlighted") {
    return kind === "implements" ? EDGE_PURPLE_HIGHLIGHTED : EDGE_BLUE_HIGHLIGHTED;
  }

  if (visualState === "normal") {
    return kind === "implements" ? EDGE_PURPLE_NORMAL : EDGE_BLUE_NORMAL;
  }

  return EDGE_GREY_MUTED;
}
