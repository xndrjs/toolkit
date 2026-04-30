import { describe, expect, it } from "vitest";

import { capabilities } from "./capabilities";
import { domainCore, compose } from "./index";
import { primitive } from "./primitive";
import { proof } from "./proof";
import { shape } from "./shape";
import { arrayOf, objectFromFields, optional } from "./validation-compose";

describe("domainCore", () => {
  it("references the same bindings as the underlying modules", () => {
    expect(domainCore.primitive).toBe(primitive);
    expect(domainCore.shape).toBe(shape);
    expect(domainCore.capabilities).toBe(capabilities);
    expect(domainCore.proof).toBe(proof);
    expect(compose.object).toBe(objectFromFields);
    expect(compose.array).toBe(arrayOf);
    expect(compose.optional).toBe(optional);
  });
});
