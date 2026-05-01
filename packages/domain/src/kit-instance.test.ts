/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expectTypeOf, it } from "vitest";

import type { Branded } from "./branded";
import type { KitInstance } from "./kit-instance";
import { primitive } from "./primitive";
import { proof } from "./proof";
import { shape } from "./shape";
import type { Validator } from "./validation";

function emailValidator(): Validator<string> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "string") {
        return {
          success: false as const,
          error: {
            engine: "test",
            issues: [{ code: "invalid_type", path: [], message: "Expected string" }],
          },
        };
      }
      return { success: true as const, data: input.toLowerCase() };
    },
  };
}

function itemValidator(): Validator<{ id: string; count: number }, { id: string; count: number }> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return {
          success: false as const,
          error: {
            engine: "test",
            issues: [{ code: "invalid_type", path: [], message: "Expected object" }],
          },
        };
      }
      const row = input as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.count !== "number") {
        return {
          success: false as const,
          error: {
            engine: "test",
            issues: [{ code: "invalid_row", path: [], message: "Invalid row" }],
          },
        };
      }
      return { success: true as const, data: { id: row.id, count: row.count } };
    },
  };
}

describe("KitInstance", () => {
  it("infers primitive and shape instances from create", () => {
    const Email = primitive("Email", emailValidator());
    const Item = shape("Item", itemValidator());

    expectTypeOf<KitInstance<typeof Email>>().toEqualTypeOf<Readonly<Branded<"Email", string>>>();
    expectTypeOf<KitInstance<typeof Item>>().toEqualTypeOf<ReturnType<typeof Item.create>>();
  });

  it("infers proof branded value from test predicate", () => {
    const Verified = proof("Verified", itemValidator()).refineType(
      (row): row is { id: string; count: number } & { count: 1 } => row.count === 1
    );

    expectTypeOf<KitInstance<typeof Verified>>().toEqualTypeOf<
      Readonly<Branded<"Verified", { id: string; count: number } & { count: 1 }>>
    >();
  });
});
