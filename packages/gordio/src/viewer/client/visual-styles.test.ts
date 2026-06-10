import { describe, expect, it } from "vitest";

import {
  edgeOpacity,
  edgeStrokeColor,
  edgeStrokeDasharray,
  edgeStrokeWidth,
  visualStateClass,
} from "./visual-styles";

describe("visual-styles", () => {
  it("maps visual states to css classes and edge styles", () => {
    expect(visualStateClass("normal")).toBeUndefined();
    expect(visualStateClass("highlighted")).toBe("gordio-visual-highlighted");
    expect(visualStateClass("muted")).toBe("gordio-visual-muted");
    expect(edgeStrokeWidth("highlighted")).toBe(3);
    expect(edgeStrokeWidth("normal")).toBe(1.5);
    expect(edgeStrokeWidth("muted")).toBe(1.5);
    expect(edgeStrokeDasharray()).toBe("none");
    expect(edgeOpacity("muted", false)).toBe(0.45);
    expect(edgeOpacity("highlighted", true)).toBe(1);
    expect(edgeOpacity("normal", true)).toBe(0.55);
    expect(edgeStrokeColor("normal", "uses")).toBe("#9aa3b2");
    expect(edgeStrokeColor("muted", "implements")).toBe("#9aa3b2");
    expect(edgeStrokeColor("highlighted", "uses")).toBe("#5a7ccf");
    expect(edgeStrokeColor("highlighted", "implements")).toBe("#9a6bdb");
  });
});
