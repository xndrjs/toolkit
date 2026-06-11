import type { LayeredReachabilityPreset } from "../view/layered-reachability";

export const cleanArchitectureLayeredReachability: LayeredReachabilityPreset = {
  seedSlot: "composition-roots",
  rules: [
    { id: "composition-to-use-cases", from: ["composition-roots"], to: ["use-cases"] },
    { id: "use-cases-to-operations", from: ["use-cases"], to: ["operations"] },
    { id: "operations-to-models", from: ["operations"], to: ["models"], directed: false },
    { id: "use-cases-to-ports", from: ["use-cases"], to: ["ports"] },
    { id: "ports-to-adapters", from: ["ports"], to: ["adapters"], directed: false },
    { id: "adapters-to-loaders", from: ["adapters"], to: ["loaders"] },
  ],
};
