import type { DiscoveryOptions } from "../discovery/types";
import type { ArchitectureGraph, ArchitectureViewSchema } from "../graph/types";

export interface ArchitectureGraphDocument {
  version: 1;
  graph: ArchitectureGraph;
}

export interface GordioConfig {
  rootDir?: string;
  exclude?: DiscoveryOptions["exclude"];
  matchers: DiscoveryOptions["matchers"];
  schema?: ArchitectureViewSchema;
}

export function defineConfig(config: GordioConfig): GordioConfig {
  return config;
}
