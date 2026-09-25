import { resolve } from "node:path";

import { createJiti } from "jiti";

import { defineConfig, type NaviQlCodegenConfig } from "../compile/config/define-config";

type ConfigModule =
  | NaviQlCodegenConfig
  | {
      default?: NaviQlCodegenConfig;
      config?: NaviQlCodegenConfig;
    };

function hasConfigExport(mod: ConfigModule): mod is {
  default?: NaviQlCodegenConfig;
  config?: NaviQlCodegenConfig;
} {
  return "default" in mod || "config" in mod;
}

export async function loadConfigFile(configPath: string): Promise<NaviQlCodegenConfig> {
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
