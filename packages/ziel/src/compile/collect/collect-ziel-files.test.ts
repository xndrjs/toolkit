import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectZielFiles } from "./collect-ziel-files";

describe("collectZielFiles", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function setupFixture(): string {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-collect-"));
    mkdirSync(join(tempDir, "src", "a"), { recursive: true });
    mkdirSync(join(tempDir, "src", "b"), { recursive: true });
    mkdirSync(join(tempDir, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(tempDir, "vendor"), { recursive: true });

    writeFileSync(join(tempDir, "src", "b", "z.ziel"), "scalar Z on string;");
    writeFileSync(join(tempDir, "src", "a", "m.ziel"), "scalar M on string;");
    writeFileSync(join(tempDir, "root.ziel"), "scalar Root on string;");
    writeFileSync(join(tempDir, "src", "a", "notes.txt"), "not ziel");
    writeFileSync(
      join(tempDir, "node_modules", "pkg", "ignored.ziel"),
      "scalar Ignored on string;"
    );
    writeFileSync(join(tempDir, "vendor", "extra.ziel"), "scalar Extra on string;");

    return tempDir;
  }

  it("globs **/*.ziel under root, excludes node_modules, and sorts stably", () => {
    const root = setupFixture();

    const files = collectZielFiles({ root });

    expect(files).toEqual([
      join(root, "root.ziel"),
      join(root, "src", "a", "m.ziel"),
      join(root, "src", "b", "z.ziel"),
      join(root, "vendor", "extra.ziel"),
    ]);
  });

  it("honors custom include and exclude", () => {
    const root = setupFixture();

    const files = collectZielFiles({
      root,
      include: ["src/**/*.ziel"],
      exclude: ["**/b/**"],
    });

    expect(files).toEqual([join(root, "src", "a", "m.ziel")]);
  });

  it("applies string pathFilter as RegExp on relative posix paths", () => {
    const root = setupFixture();

    const files = collectZielFiles({
      root,
      pathFilter: "^src/",
    });

    expect(files).toEqual([join(root, "src", "a", "m.ziel"), join(root, "src", "b", "z.ziel")]);
  });

  it("applies RegExp pathFilter", () => {
    const root = setupFixture();

    const files = collectZielFiles({
      root,
      pathFilter: /vendor\/|root\.ziel$/,
    });

    expect(files).toEqual([join(root, "root.ziel"), join(root, "vendor", "extra.ziel")]);
  });

  it("returns an empty list when nothing matches", () => {
    const root = setupFixture();

    expect(
      collectZielFiles({
        root,
        include: ["**/*.missing"],
      })
    ).toEqual([]);
  });
});
