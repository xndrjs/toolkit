import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createJiti } from "jiti";

import { defineConfig, type ZielCodegenConfig } from "../compile/config/define-config";

type ConfigModule =
  | ZielCodegenConfig
  | {
      default?: ZielCodegenConfig;
      config?: ZielCodegenConfig;
    };

function hasConfigExport(mod: ConfigModule): mod is {
  default?: ZielCodegenConfig;
  config?: ZielCodegenConfig;
} {
  return "default" in mod || "config" in mod;
}

export async function loadConfigFile(configPath: string): Promise<ZielCodegenConfig> {
  const absolute = resolve(configPath);
  const jiti = createJiti(pathToFileURL(absolute).href);
  const mod = (await jiti.import(absolute)) as ConfigModule;

  const raw = hasConfigExport(mod) ? (mod.default ?? mod.config) : mod;
  if (!raw) {
    throw new Error(
      `Config file "${configPath}" must export a default or named \`config\` from defineConfig(...).`
    );
  }

  return defineConfig(raw);
}
