import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectNaviQlFiles } from "./collect-naviql-files";

describe("collectNaviQlFiles", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function setupFixture(): string {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-naviql-collect-"));
    mkdirSync(join(tempDir, "src", "a"), { recursive: true });
    mkdirSync(join(tempDir, "src", "b"), { recursive: true });
    mkdirSync(join(tempDir, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(tempDir, "vendor"), { recursive: true });

    writeFileSync(join(tempDir, "src", "b", "z.naviql"), "scalar Z on string;");
    writeFileSync(join(tempDir, "src", "a", "m.naviql"), "scalar M on string;");
    writeFileSync(join(tempDir, "root.naviql"), "scalar Root on string;");
    writeFileSync(join(tempDir, "src", "a", "notes.txt"), "not naviql");
    writeFileSync(
      join(tempDir, "node_modules", "pkg", "ignored.naviql"),
      "scalar Ignored on string;"
    );
    writeFileSync(join(tempDir, "vendor", "extra.naviql"), "scalar Extra on string;");

    return tempDir;
  }

  it("globs **/*.naviql under root, excludes node_modules, and sorts stably", () => {
    const root = setupFixture();

    const files = collectNaviQlFiles({ root });

    expect(files).toEqual([
      join(root, "root.naviql"),
      join(root, "src", "a", "m.naviql"),
      join(root, "src", "b", "z.naviql"),
      join(root, "vendor", "extra.naviql"),
    ]);
  });

  it("honors custom include and exclude", () => {
    const root = setupFixture();

    const files = collectNaviQlFiles({
      root,
      include: ["src/**/*.naviql"],
      exclude: ["**/b/**"],
    });

    expect(files).toEqual([join(root, "src", "a", "m.naviql")]);
  });

  it("applies string pathFilter as RegExp on relative posix paths", () => {
    const root = setupFixture();

    const files = collectNaviQlFiles({
      root,
      pathFilter: "^src/",
    });

    expect(files).toEqual([join(root, "src", "a", "m.naviql"), join(root, "src", "b", "z.naviql")]);
  });

  it("applies RegExp pathFilter", () => {
    const root = setupFixture();

    const files = collectNaviQlFiles({
      root,
      pathFilter: /vendor\/|root\.naviql$/,
    });

    expect(files).toEqual([join(root, "root.naviql"), join(root, "vendor", "extra.naviql")]);
  });

  it("returns an empty list when nothing matches", () => {
    const root = setupFixture();

    expect(
      collectNaviQlFiles({
        root,
        include: ["**/*.missing"],
      })
    ).toEqual([]);
  });
});
