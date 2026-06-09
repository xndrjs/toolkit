import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverArchitectureGraph, createId } from "./discovery/index";

let fixtureDirs: string[] = [];

afterEach(async () => {
  await Promise.all(fixtureDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  fixtureDirs = [];
});

describe("discoverArchitectureGraph", () => {
  it("discovers files with matchers and merges duplicate fragments", async () => {
    const rootDir = await createFixture({
      "packages/core-orders/package.json": JSON.stringify({
        name: "@acme/core-orders",
        gordio: { title: "Orders" },
      }),
      "packages/core-orders/src/submit-order.capability.ts": "export class SubmitOrder {}",
      "packages/core-orders/src/order-repository.port.ts": "export interface OrderRepository {}",
      "packages/core-orders/src/ignored.spec.ts": "ignored",
    });

    const graph = await discoverArchitectureGraph({
      rootDir,
      matchers: [
        {
          id: "package-json",
          include: "packages/*/package.json",
          parse(file, context) {
            const manifest = JSON.parse(file.contents) as {
              name: string;
              gordio?: { title?: string };
            };
            const packageName = path.basename(path.dirname(file.relativePath));

            return {
              boxes: [
                {
                  id: context.createId("pkg", packageName),
                  kind: "core-package",
                  title: manifest.gordio?.title ?? packageName,
                  laneId: "core",
                  packageName: manifest.name,
                  metadata: { discoveredBy: file.matcherId },
                },
              ],
            };
          },
        },
        {
          id: "core-code",
          include: "packages/*/src/**/*.ts",
          exclude: "**/*.spec.ts",
          parse(file, context) {
            const packageName = getPackageName(file.relativePath);
            const fileName = path.basename(file.relativePath, ".ts");
            const kind = fileName.endsWith(".port") ? "port" : "capability";
            const title = toTitle(fileName.replace(/\.(capability|port)$/, ""));

            return [
              {
                boxes: [
                  {
                    id: context.createId("pkg", packageName),
                    kind: "core-package",
                    title: "Orders",
                    laneId: "core",
                  },
                ],
                nodes: [
                  {
                    id: context.createId("core", packageName, title),
                    kind,
                    title,
                    boxId: context.createId("pkg", packageName),
                    slot: kind === "port" ? "ports" : "operations",
                    data: { file: file.relativePath },
                  },
                ],
              },
            ];
          },
        },
        {
          id: "edges",
          include: "packages/*/src/*.capability.ts",
          async parse(file, context) {
            const packageName = getPackageName(file.relativePath);

            return {
              edges: [
                {
                  sourceId: context.createId("core", packageName, "SubmitOrder"),
                  targetId: context.createId("core", packageName, "OrderRepository"),
                  kind: "uses",
                  directed: true,
                },
              ],
            };
          },
        },
      ],
    });

    expect(graph).toMatchInlineSnapshot(`
      {
        "boxes": [
          {
            "id": "pkg:core-orders",
            "kind": "core-package",
            "laneId": "core",
            "metadata": {
              "discoveredBy": "package-json",
            },
            "packageName": "@acme/core-orders",
            "title": "Orders",
          },
        ],
        "edges": [
          {
            "directed": true,
            "kind": "uses",
            "sourceId": "core:core-orders:submitorder",
            "targetId": "core:core-orders:orderrepository",
          },
        ],
        "nodes": [
          {
            "boxId": "pkg:core-orders",
            "data": {
              "file": "packages/core-orders/src/order-repository.port.ts",
            },
            "id": "core:core-orders:orderrepository",
            "kind": "port",
            "slot": "ports",
            "title": "OrderRepository",
          },
          {
            "boxId": "pkg:core-orders",
            "data": {
              "file": "packages/core-orders/src/submit-order.capability.ts",
            },
            "id": "core:core-orders:submitorder",
            "kind": "capability",
            "slot": "operations",
            "title": "SubmitOrder",
          },
        ],
      }
    `);
  });

  it("throws a readable error when a matcher fails", async () => {
    const rootDir = await createFixture({
      "packages/core-orders/package.json": "{",
    });

    await expect(
      discoverArchitectureGraph({
        rootDir,
        matchers: [
          {
            id: "broken-json",
            include: "**/package.json",
            parse(file) {
              JSON.parse(file.contents);
            },
          },
        ],
      })
    ).rejects.toThrow(
      /Discovery matcher "broken-json" failed for "packages\/core-orders\/package.json"/
    );
  });

  it("applies global excludes and skips default generated directories", async () => {
    const rootDir = await createFixture({
      "packages/core-orders/src/visible.ts": "visible",
      "packages/core-orders/src/visible.generated.ts": "generated",
      "packages/core-orders/dist/compiled.ts": "compiled",
      "packages/core-orders/.next/server.ts": "next",
      "packages/core-orders/src/.DS_Store": "noise",
      "packages/core-orders/src/cache.tsbuildinfo": "cache",
    });
    const matchedFiles: string[] = [];

    await discoverArchitectureGraph({
      rootDir,
      exclude: "**/*.generated.ts",
      matchers: [
        {
          id: "all-typescript",
          include: "packages/**/*.ts",
          parse(file) {
            matchedFiles.push(file.relativePath);
          },
        },
      ],
    });

    expect(matchedFiles).toEqual(["packages/core-orders/src/visible.ts"]);
  });
});

describe("createId", () => {
  it("creates deterministic ids from arbitrary text parts", () => {
    expect(createId("Core", "Orders API", "Submit Order!")).toBe("core:orders-api:submit-order");
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "gordio-discovery-"));
  fixtureDirs.push(rootDir);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const absolutePath = path.join(rootDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents, "utf8");
    })
  );

  return rootDir;
}

function toTitle(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function getPackageName(relativePath: string): string {
  const packageName = relativePath.split("/")[1];

  if (!packageName) {
    throw new Error(`Expected package path, received "${relativePath}"`);
  }

  return packageName;
}
