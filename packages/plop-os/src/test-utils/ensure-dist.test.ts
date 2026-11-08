import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDist } from "./ensure-dist.js";

describe("ensureDist", () => {
  it("does not rebuild a ready dist directory", () => {
    const { pkgRoot } = ensureDist();
    const sentinel = path.join(pkgRoot, "dist", "ensure-dist-ready.sentinel");
    writeFileSync(sentinel, "ready", "utf8");

    try {
      ensureDist();
      expect(existsSync(sentinel)).toBe(true);
    } finally {
      rmSync(sentinel, { force: true });
    }
  });
});
