import { describe, expect, it } from "vitest";

import { resolveBarrierDemoPage } from "./resolve-barrier-demo-page.js";
import { resolveLaneDemoPage } from "./resolve-lane-demo-page.js";

describe("demo resolve strategies", () => {
  it("resolves with barrier gateway rounds", async () => {
    const result = await resolveBarrierDemoPage("en-US");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.page.type).toBe("Page");
  });

  it("resolves with lane source loaders", async () => {
    const result = await resolveLaneDemoPage("en-US");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.page.type).toBe("Page");
  });
});
