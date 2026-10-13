import { describe, expect, it } from "vitest";

import { z } from "zod";

import { domain, zodFromKit, zodToValidator } from "./index";

describe("domain-zod exports", () => {
  it("exposes function-first adapter helpers", () => {
    expect(zodFromKit).toBeDefined();
    expect(typeof zodFromKit).toBe("function");
    expect(zodToValidator).toBeDefined();
    expect(typeof zodToValidator).toBe("function");
  });

  it("exports adapted domain that accepts Zod schemas", () => {
    const Item = domain.shape("Item", z.object({ id: z.string() }));
    expect(Item.create({ id: "1" }).id).toBe("1");
  });
});
