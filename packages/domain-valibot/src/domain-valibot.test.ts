import { describe, expect, it } from "vitest";

import * as v from "valibot";

import { domain, valibotFromKit, valibotToValidator } from "./index";

describe("domain-valibot exports", () => {
  it("exposes function-first adapter helpers", () => {
    expect(valibotFromKit).toBeDefined();
    expect(typeof valibotFromKit).toBe("function");
    expect(valibotToValidator).toBeDefined();
    expect(typeof valibotToValidator).toBe("function");
  });

  it("exports adapted domain that accepts Valibot schemas", () => {
    const Item = domain.shape("Item", v.object({ id: v.string() }));
    expect(Item.create({ id: "1" }).id).toBe("1");
  });
});
