import { describe, expect, it } from "vitest";

import { valibotFromKit, valibotToValidator } from "./index";

describe("domain-valibot exports", () => {
  it("exposes function-first adapter helpers", () => {
    expect(valibotFromKit).toBeDefined();
    expect(typeof valibotFromKit).toBe("function");
    expect(valibotToValidator).toBeDefined();
    expect(typeof valibotToValidator).toBe("function");
  });
});
