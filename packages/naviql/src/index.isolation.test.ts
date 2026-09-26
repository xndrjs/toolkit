import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageSrc = dirname(fileURLToPath(import.meta.url));

/** Module specifier from `import` / `export … from` lines. */
function moduleSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /\b(?:import|export)\b[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    specs.push(match[1]!);
  }
  return specs;
}

describe("main entry isolation", () => {
  it("src/index.ts does not import cli, collect, lsp, or fs", () => {
    const source = readFileSync(join(packageSrc, "index.ts"), "utf8");
    const specs = moduleSpecifiers(source);

    expect(specs.length).toBeGreaterThan(0);

    for (const spec of specs) {
      expect(spec).not.toMatch(/(^|\/)cli(\/|$)/);
      expect(spec).not.toMatch(/(^|\/)collect(\/|$)/);
      expect(spec).not.toMatch(/(^|\/)lsp(\/|$)/);
      expect(spec).not.toBe("node:fs");
      expect(spec).not.toBe("node:fs/promises");
      expect(spec).not.toBe("fs");
      expect(spec).not.toBe("fs/promises");
      expect(spec).not.toMatch(/^langium\/lsp$/);
      expect(spec).not.toMatch(/^vscode-languageserver/);
    }

    expect(source).not.toMatch(/\bcollectNaviQlFiles\b/);
    expect(source).not.toMatch(/\brunCli\b/);
    expect(source).not.toMatch(/\bbuildResources\b/);
    expect(source).not.toMatch(/\bcreateNaviQlLspServices\b/);
    expect(source).not.toMatch(/\bstartLanguageServer\b/);
  });

  it("compile barrel does not export runCli or lsp", () => {
    const source = readFileSync(join(packageSrc, "compile", "index.ts"), "utf8");
    expect(source).not.toMatch(/\brunCli\b/);
    expect(source).not.toMatch(/\bcreateNaviQlLspServices\b/);
    expect(moduleSpecifiers(source).every((s) => !/(^|\/)cli(\/|$)/.test(s))).toBe(true);
    expect(moduleSpecifiers(source).every((s) => !/(^|\/)lsp(\/|$)/.test(s))).toBe(true);
  });
});
