import { describe, expect, it } from "vitest";

import { isRelevantWatchPath } from "./watch";

describe("isRelevantWatchPath", () => {
  const root = "/proj";
  const configPath = "/outside/ziel.config.ts";
  const outPath = "/proj/src/generated";

  it("treats null/empty filename as relevant (unknown event)", () => {
    expect(isRelevantWatchPath(null, { root, configPath, outPath })).toBe(true);
    expect(isRelevantWatchPath("", { root, configPath, outPath })).toBe(true);
  });

  it("reacts to nested .ziel paths under root and ignores paths outside it", () => {
    expect(isRelevantWatchPath("ziel/page.ziel", { root, configPath, outPath })).toBe(true);
    expect(isRelevantWatchPath("foo/nested/bar.ziel", { root, configPath, outPath })).toBe(true);
    expect(isRelevantWatchPath("/elsewhere/page.ziel", { root, configPath, outPath })).toBe(false);
  });

  it("reacts to a config file outside the root", () => {
    expect(isRelevantWatchPath(configPath, { root, configPath, outPath })).toBe(true);
  });

  it("ignores the entire out directory, dependency metadata, and unrelated files", () => {
    expect(isRelevantWatchPath(outPath, { root, configPath, outPath })).toBe(false);
    expect(isRelevantWatchPath(`${outPath}/resources.ts`, { root, configPath, outPath })).toBe(
      false
    );
    expect(
      isRelevantWatchPath(`${outPath}/PageDetail.query.ts`, { root, configPath, outPath })
    ).toBe(false);
    expect(isRelevantWatchPath("node_modules/pkg/schema.ziel", { root, configPath, outPath })).toBe(
      false
    );
    expect(isRelevantWatchPath(".git/cache/schema.ziel", { root, configPath, outPath })).toBe(
      false
    );
    expect(isRelevantWatchPath("src/app.ts", { root, configPath, outPath })).toBe(false);
  });
});
