import { describe, expect, it } from "vitest";

import { cleanArchitecturePreset } from "../presets/clean-architecture";
import { isFrontierSlot } from "./box-frontier";

const corePackage = cleanArchitecturePreset.boxKinds.find(
  (boxKind) => boxKind.id === "core-package"
)!;

describe("isFrontierSlot", () => {
  it("treats only the first and last schema columns as frontier", () => {
    expect(isFrontierSlot(corePackage, "models")).toBe(true);
    expect(isFrontierSlot(corePackage, "operations")).toBe(false);
    expect(isFrontierSlot(corePackage, "use-cases")).toBe(false);
    expect(isFrontierSlot(corePackage, "ports")).toBe(true);
  });

  it("treats the only slot as frontier for single-column boxes", () => {
    const app = cleanArchitecturePreset.boxKinds.find((boxKind) => boxKind.id === "app")!;

    expect(isFrontierSlot(app, "composition-roots")).toBe(true);
  });
});
