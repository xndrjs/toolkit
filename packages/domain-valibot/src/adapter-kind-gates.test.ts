import { describe, it } from "vitest";
import * as v from "valibot";

import { domain, valibotToValidator } from "./index";

/**
 * Kind gates: adapter top-level factories reject scalar/object mismatches at the type level,
 * matching `domain.core.shape` / `domain.core.primitive`.
 */
describe("adapter kind gates vs domain.core", () => {
  it("domain.core.shape rejects a scalar Valibot validator at the type level", () => {
    // @ts-expect-error -- Validator<string, string> is not object-shaped
    domain.core.shape("Bad", valibotToValidator(v.string()));
  });

  it("domain.core.primitive rejects an object Valibot validator at the type level", () => {
    // @ts-expect-error -- Validator<object, object> is not a scalar
    domain.core.primitive("Bad", valibotToValidator(v.object({ a: v.string() })));
  });

  it("domain.shape rejects a scalar Valibot schema at the type level", () => {
    // @ts-expect-error -- scalar Valibot schema is not a shape
    domain.shape("Bad", v.string());
  });

  it("domain.primitive rejects an object Valibot schema at the type level", () => {
    // @ts-expect-error -- object Valibot schema is not a primitive
    domain.primitive("Bad", v.object({ a: v.string() }));
  });
});
