import { describe, expect, it } from "vitest";

import { zodFromKit, zodToValidator } from "./index";

describe("domain-zod exports", () => {
  it("exposes function-first adapter helpers", () => {
    expect(zodFromKit).toBeDefined();
    expect(typeof zodFromKit).toBe("function");
    expect(zodToValidator).toBeDefined();
    expect(typeof zodToValidator).toBe("function");
  });
});
