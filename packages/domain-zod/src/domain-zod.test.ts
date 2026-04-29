import { describe, expect, it } from "vitest";

import { domainZod } from "./index";

describe("domainZod", () => {
  it("groups Zod-first factories without shadowing core names", () => {
    expect(domainZod.primitive).toBe(domainZod.primitiveFromZod);
    expect(domainZod.shape).toBe(domainZod.shapeFromZod);
    expect(domainZod.field).toBe(domainZod.brandedField);
    expect(domainZod.fromZod).toBeDefined();
    expect(typeof domainZod.fromZod).toBe("function");
  });
});
