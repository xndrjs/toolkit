import { describe, expect, it } from "vitest";

import { resolveRawArrayDemo } from "./resolve-raw-array.js";

describe("resolveRawArrayDemo", () => {
  it("uses the whole array payload as the resolve-to-each source", async () => {
    const { rawArrayExample } = await resolveRawArrayDemo();

    expect(rawArrayExample).toEqual([
      {
        __typename: "RawArrayItem",
        id: "first",
        title: "Item first",
      },
      {
        __typename: "RawArrayItem",
        id: "second",
        title: "Item second",
      },
    ]);
  });
});
