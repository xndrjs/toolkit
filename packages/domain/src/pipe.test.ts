import { describe, expect, it } from "vitest";

import { pipe } from "./pipe";

describe("@xndrjs/domain pipe", () => {
  it("pipes unary transforms", () => {
    expect(
      pipe(
        1,
        (n) => n + 1,
        (n) => String(n)
      )
    ).toBe("2");
  });
});
