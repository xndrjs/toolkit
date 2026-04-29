import { describe, expect, it } from "vitest";

import { capabilities } from "./capabilities";
import { domainCore } from "./index";
import { primitive } from "./primitive";
import { proof } from "./proof";
import { shape } from "./shape";

describe("domainCore", () => {
  it("references the same bindings as the underlying modules", () => {
    expect(domainCore.primitive).toBe(primitive);
    expect(domainCore.shape).toBe(shape);
    expect(domainCore.capabilities).toBe(capabilities);
    expect(domainCore.proof).toBe(proof);
  });
});
