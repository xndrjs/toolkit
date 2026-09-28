import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { isRelevantWatchPath, watchCodegenInputs } from "./watch";

describe("isRelevantWatchPath", () => {
  const root = "/proj";
  const configPath = "/proj/ziel.config.ts";
  const outPath = "/proj/src/generated/ziel.ts";

  it("treats null/empty filename as relevant (unknown event)", () => {
    expect(isRelevantWatchPath(null, { root, configPath, outPath })).toBe(true);
    expect(isRelevantWatchPath("", { root, configPath, outPath })).toBe(true);
  });

  it("reacts to .ziel paths under root", () => {
    expect(isRelevantWatchPath("ziel/page.ziel", { root, configPath, outPath })).toBe(true);
    expect(isRelevantWatchPath("foo/bar.ziel", { root, configPath, outPath })).toBe(true);
  });

  it("reacts to the config file", () => {
    expect(isRelevantWatchPath("ziel.config.ts", { root, configPath, outPath })).toBe(true);
  });

  it("ignores the generated out file", () => {
    expect(isRelevantWatchPath("src/generated/ziel.ts", { root, configPath, outPath })).toBe(false);
  });

  it("ignores unrelated files", () => {
    expect(isRelevantWatchPath("src/app.ts", { root, configPath, outPath })).toBe(false);
    expect(isRelevantWatchPath("README.md", { root, configPath, outPath })).toBe(false);
  });
});

describe("watchCodegenInputs", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("debounces and invokes onChange for .ziel writes", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-watch-"));
    const zielDir = join(tempDir, "ziel");
    mkdirSync(zielDir, { recursive: true });
    writeFileSync(join(zielDir, "a.ziel"), "scalar Id on string;\n");

    const reasons: string[] = [];
    const dispose = watchCodegenInputs({
      root: tempDir,
      configPath: join(tempDir, "ziel.config.ts"),
      outPath: join(tempDir, "out.ts"),
      debounceMs: 30,
      onChange: (reason) => {
        reasons.push(reason);
      },
    });

    try {
      writeFileSync(join(zielDir, "a.ziel"), "scalar Id on string;\nresource X(id: Id): { id }\n");
      writeFileSync(join(zielDir, "a.ziel"), "scalar Id on string;\nresource Y(id: Id): { id }\n");

      await new Promise((r) => setTimeout(r, 120));

      expect(reasons.length).toBeGreaterThanOrEqual(1);
      expect(reasons.some((r) => r.includes(".ziel"))).toBe(true);
    } finally {
      dispose();
    }
  });
});
