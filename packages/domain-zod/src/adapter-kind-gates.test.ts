import { describe, it } from "vitest";
import { z } from "zod";

import { domain, zodToValidator } from "./index";

/**
 * Kind gates: adapter top-level factories reject scalar/object mismatches at the type level,
 * matching `domain.core.shape` / `domain.core.primitive`.
 */
describe("adapter kind gates vs domain.core", () => {
  it("domain.core.shape rejects a scalar Zod validator at the type level", () => {
    // @ts-expect-error -- Validator<string, string> is not object-shaped
    domain.core.shape("Bad", zodToValidator(z.string()));
  });

  it("domain.core.primitive rejects an object Zod validator at the type level", () => {
    // @ts-expect-error -- Validator<object, object> is not a scalar
    domain.core.primitive("Bad", zodToValidator(z.object({ a: z.string() })));
  });

  it("domain.shape rejects a scalar Zod schema at the type level", () => {
    // @ts-expect-error -- scalar Zod schema is not a shape
    domain.shape("Bad", z.string());
  });

  it("domain.primitive rejects an object Zod schema at the type level", () => {
    // @ts-expect-error -- object Zod schema is not a primitive
    domain.primitive("Bad", z.object({ a: z.string() }));
  });
});
