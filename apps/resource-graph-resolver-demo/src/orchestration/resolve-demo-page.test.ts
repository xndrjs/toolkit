import { describe, expect, it } from "vitest";

import { resolveDemoPage } from "./resolve-demo-page.js";

describe("resolveDemoPage", () => {
  it("resolves the demo page aggregate", async () => {
    const result = await resolveDemoPage("en-US");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.strategy).toBe("lane");
    expect(result.page.type).toBe("Page");
  });
});
