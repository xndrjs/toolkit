import type { VisualState } from "../../projection/types";

export function visualStateClass(visualState: VisualState): string | undefined {
  return visualState === "normal" ? undefined : `gordio-visual-${visualState}`;
}

export function edgeOpacity(visualState: VisualState, rerouted: boolean): number {
  switch (visualState) {
    case "highlighted":
      return 1;
    case "muted":
      return 0.45;
    default:
      return rerouted ? 0.55 : 0.9;
  }
}

export function edgeStrokeWidth(visualState: VisualState): number {
  return visualState === "highlighted" ? 3 : 1.5;
}

export function edgeStrokeDasharray(): string {
  return "none";
}

export function edgeStrokeColor(visualState: VisualState, kind?: string): string {
  if (visualState === "highlighted") {
    return kind === "implements" ? "#9a6bdb" : "#5a7ccf";
  }

  return "#9aa3b2";
}
