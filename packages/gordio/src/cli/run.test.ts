import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "./run";

let fixtureDirs: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  fixtureDirs = [];
});

describe("runCli", () => {
  it("runs gordio dev and prints a graph document as JSON", async () => {
    const rootDir = await createFixture();
    const output = createOutputCapture();
    const errors = createOutputCapture();

    await expect(
      runCli(["dev", "--config", "gordio.config.ts", "--json"], {
        cwd: rootDir,
        stdout: output,
        stderr: errors,
      })
    ).resolves.toBe(0);

    expect(JSON.parse(output.text)).toEqual({
      version: 1,
      graph: {
        boxes: [
          {
            id: "pkg:core-orders",
            kind: "core-package",
            title: "Orders",
            laneId: "core",
            packageName: "@acme/core-orders",
          },
        ],
        nodes: [
          {
            id: "core:core-orders",
            kind: "capability",
            title: "Orders",
            boxId: "pkg:core-orders",
            slot: "operations",
          },
        ],
        edges: [],
      },
    });
    expect(errors.text).toContain("gordio dev: discovered 1 boxes, 1 nodes, 0 edges");
  });

  it("writes a graph document to --out", async () => {
    const rootDir = await createFixture();
    const output = createOutputCapture();
    const errors = createOutputCapture();

    await runCli(["dev", "--out", "artifacts/gordio.graph.json"], {
      cwd: rootDir,
      stdout: output,
      stderr: errors,
    });

    const artifact = await readFile(path.join(rootDir, "artifacts/gordio.graph.json"), "utf8");
    expect(JSON.parse(artifact)).toMatchObject({
      version: 1,
      graph: {
        boxes: [{ id: "pkg:core-orders" }],
      },
    });
    expect(output.text).toBe("");
    expect(errors.text).toContain("gordio dev: wrote artifacts/gordio.graph.json");
  });

  it("surfaces discovery matcher failures with file context", async () => {
    const rootDir = await createFixture({
      configSource: `
        export default {
          matchers: [
            {
              id: "broken",
              include: "packages/*/package.json",
              parse() {
                throw new Error("boom");
              },
            },
          ],
        };
      `,
    });

    await expect(
      runCli(["dev"], {
        cwd: rootDir,
        stdout: createOutputCapture(),
        stderr: createOutputCapture(),
      })
    ).rejects.toThrow(
      /Discovery matcher "broken" failed for "packages\/core-orders\/package.json": boom/
    );
  });
});

interface FixtureOptions {
  configSource?: string;
}

async function createFixture(options: FixtureOptions = {}): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "gordio-cli-"));
  fixtureDirs.push(rootDir);

  await writeFixtureFile(
    rootDir,
    "packages/core-orders/package.json",
    JSON.stringify({ name: "@acme/core-orders", gordio: { title: "Orders" } })
  );
  await writeFixtureFile(
    rootDir,
    "gordio.config.ts",
    options.configSource ?? defaultConfigSource()
  );

  return rootDir;
}

async function writeFixtureFile(
  rootDir: string,
  relativePath: string,
  contents: string
): Promise<void> {
  const absolutePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}

function defaultConfigSource(): string {
  return `
    export default {
      rootDir: ".",
      matchers: [
        {
          id: "package-json",
          include: "packages/*/package.json",
          parse(file, context) {
            const manifest = JSON.parse(file.contents);
            const packageName = file.relativePath.split("/")[1];
            const boxId = context.createId("pkg", packageName);

            return {
              boxes: [
                {
                  id: boxId,
                  kind: "core-package",
                  title: manifest.gordio.title,
                  laneId: "core",
                  packageName: manifest.name,
                },
              ],
              nodes: [
                {
                  id: context.createId("core", packageName),
                  kind: "capability",
                  title: manifest.gordio.title,
                  boxId,
                  slot: "operations",
                },
              ],
            };
          },
        },
      ],
    };
  `;
}

function createOutputCapture(): Pick<NodeJS.WriteStream, "write"> & { text: string } {
  return {
    text: "",
    write(chunk: string | Uint8Array): boolean {
      this.text += String(chunk);
      return true;
    },
  };
}
