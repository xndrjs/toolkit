import { describe, expect, it } from "vitest";

import { capabilities } from "./capabilities";
import { compose, domain } from "./index";
import { primitive } from "./primitive";
import { proof } from "./proof";
import { shape } from "./shape";
import { arrayOf, objectFromFields, optional } from "./validation-compose";

describe("domain", () => {
  it("references the same bindings as the underlying modules", () => {
    expect(domain.primitive).toBe(primitive);
    expect(domain.shape).toBe(shape);
    expect(domain.capabilities).toBe(capabilities);
    expect(domain.proof).toBe(proof);
    expect(compose.object).toBe(objectFromFields);
    expect(compose.array).toBe(arrayOf);
    expect(compose.optional).toBe(optional);
  });
});
