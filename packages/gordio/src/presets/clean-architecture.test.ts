import { describe, expect, it } from "vitest";

import { cleanArchitecturePreset } from "./clean-architecture";

describe("cleanArchitecturePreset", () => {
  it("places capabilities and services in the operations slot", () => {
    const corePackage = cleanArchitecturePreset.boxKinds.find(
      (boxKind) => boxKind.id === "core-package"
    );
    const operations = corePackage?.slots.find((slot) => slot.id === "operations");

    expect(operations?.accepts).toEqual(["capability", "service"]);
    expect(cleanArchitecturePreset.nodeKinds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "capability", defaultSlot: "operations" }),
        expect.objectContaining({ id: "service", defaultSlot: "operations" }),
      ])
    );
  });

  it("renders ports as signatures", () => {
    const port = cleanArchitecturePreset.nodeKinds.find((nodeKind) => nodeKind.id === "port");

    expect(port).toEqual(expect.objectContaining({ defaultSlot: "ports", renderAs: "signature" }));
  });

  it("matches the alpha clean architecture schema", () => {
    expect(cleanArchitecturePreset).toMatchInlineSnapshot(`
      {
        "boxKinds": [
          {
            "id": "app",
            "laneId": "apps",
            "slots": [
              {
                "id": "composition-roots",
                "order": 1,
                "title": "Composition roots",
              },
            ],
          },
          {
            "collapsible": true,
            "id": "core-package",
            "laneId": "core",
            "slots": [
              {
                "accepts": [
                  "model",
                ],
                "id": "models",
                "order": 1,
                "title": "Models",
              },
              {
                "accepts": [
                  "capability",
                  "service",
                ],
                "id": "operations",
                "order": 2,
                "title": "Operations",
              },
              {
                "accepts": [
                  "use-case",
                ],
                "id": "use-cases",
                "order": 3,
                "title": "Use cases",
              },
              {
                "accepts": [
                  "port",
                ],
                "id": "ports",
                "order": 4,
                "title": "Ports",
              },
            ],
          },
          {
            "collapsible": true,
            "id": "infrastructure-package",
            "laneId": "infrastructure",
            "slots": [
              {
                "accepts": [
                  "adapter",
                  "repository",
                ],
                "id": "adapters",
                "order": 1,
                "title": "Adapters",
              },
              {
                "accepts": [
                  "loader",
                ],
                "id": "loaders",
                "order": 2,
                "title": "Loaders",
              },
            ],
          },
        ],
        "lanes": [
          {
            "id": "apps",
            "order": 1,
            "title": "Apps",
          },
          {
            "id": "core",
            "order": 2,
            "title": "Core",
          },
          {
            "id": "infrastructure",
            "order": 3,
            "title": "Infrastructure",
          },
        ],
        "nodeKinds": [
          {
            "defaultSlot": "composition-roots",
            "id": "composition-root",
          },
          {
            "defaultSlot": "models",
            "id": "model",
          },
          {
            "defaultSlot": "operations",
            "id": "capability",
          },
          {
            "defaultSlot": "operations",
            "id": "service",
          },
          {
            "defaultSlot": "use-cases",
            "id": "use-case",
          },
          {
            "defaultSlot": "ports",
            "id": "port",
            "renderAs": "signature",
          },
          {
            "defaultSlot": "adapters",
            "id": "adapter",
          },
          {
            "defaultSlot": "adapters",
            "id": "repository",
          },
          {
            "defaultSlot": "loaders",
            "id": "loader",
          },
        ],
      }
    `);
  });
});
