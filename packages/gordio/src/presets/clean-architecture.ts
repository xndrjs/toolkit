import type { ArchitectureViewSchema } from "../graph/types";

export const cleanArchitecturePreset: ArchitectureViewSchema = {
  lanes: [
    { id: "apps", title: "Apps", order: 1 },
    { id: "core", title: "Core", order: 2 },
    { id: "infrastructure", title: "Infrastructure", order: 3 },
  ],
  boxKinds: [
    {
      id: "app",
      laneId: "apps",
      slots: [{ id: "composition-roots", title: "Composition roots", order: 1 }],
    },
    {
      id: "core-package",
      laneId: "core",
      collapsible: true,
      slots: [
        { id: "models", title: "Models", order: 1, accepts: ["model"] },
        { id: "operations", title: "Operations", order: 2, accepts: ["capability", "service"] },
        { id: "use-cases", title: "Use cases", order: 3, accepts: ["use-case"] },
        { id: "ports", title: "Ports", order: 4, accepts: ["port"] },
      ],
    },
    {
      id: "infrastructure-package",
      laneId: "infrastructure",
      collapsible: true,
      slots: [
        {
          id: "adapters",
          title: "Adapters",
          order: 1,
          accepts: ["adapter", "repository"],
        },
        { id: "loaders", title: "Loaders", order: 2, accepts: ["loader"] },
      ],
    },
  ],
  nodeKinds: [
    { id: "composition-root", defaultSlot: "composition-roots" },
    { id: "model", defaultSlot: "models" },
    { id: "capability", defaultSlot: "operations" },
    { id: "service", defaultSlot: "operations" },
    { id: "use-case", defaultSlot: "use-cases" },
    { id: "port", defaultSlot: "ports", renderAs: "signature" },
    { id: "adapter", defaultSlot: "adapters" },
    { id: "repository", defaultSlot: "adapters" },
    { id: "loader", defaultSlot: "loaders" },
  ],
};
