import { resolve } from "node:path";

import { createJiti } from "jiti";

import { defineConfig, type ContentfulToZodConfig } from "../config/define-config";

type ConfigModule =
  | ContentfulToZodConfig
  | {
      default?: ContentfulToZodConfig;
      config?: ContentfulToZodConfig;
    };

function hasConfigExport(mod: ConfigModule): mod is {
  default?: ContentfulToZodConfig;
  config?: ContentfulToZodConfig;
} {
  return "default" in mod || "config" in mod;
}

export async function loadConfigFile(configPath: string): Promise<ContentfulToZodConfig> {
  const absolute = resolve(configPath);
  const jiti = createJiti(import.meta.url);
  const mod = (await jiti.import(absolute)) as ConfigModule;

  const raw = hasConfigExport(mod) ? (mod.default ?? mod.config) : mod;
  if (!raw) {
    throw new Error(
      `Config file "${configPath}" must export a default or named \`config\` from defineConfig(...).`
    );
  }

  return defineConfig(raw);
}
