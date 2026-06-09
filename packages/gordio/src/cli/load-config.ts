import { access } from "node:fs/promises";
import path from "node:path";

import { createJiti } from "jiti";

import { defineConfig, type GordioConfig } from "../config/define-config";

const DEFAULT_CONFIG_FILES = [
  "gordio.config.ts",
  "gordio.config.mts",
  "gordio.config.js",
  "gordio.config.mjs",
];

type ConfigModule =
  | GordioConfig
  | {
      default?: GordioConfig;
      config?: GordioConfig;
    };

export interface LoadedConfig {
  config: GordioConfig;
  path: string;
  rootDir: string;
}

function hasConfigExport(mod: ConfigModule): mod is {
  default?: GordioConfig;
  config?: GordioConfig;
} {
  return "default" in mod || "config" in mod;
}

export async function findConfigFile(cwd: string): Promise<string | undefined> {
  for (const fileName of DEFAULT_CONFIG_FILES) {
    const candidate = path.resolve(cwd, fileName);

    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep looking for the next supported config file name.
    }
  }

  return undefined;
}

export async function loadConfigFile(configPath: string, cwd: string): Promise<LoadedConfig> {
  const absolutePath = path.resolve(cwd, configPath);
  const jiti = createJiti(import.meta.url);
  const mod = (await jiti.import(absolutePath)) as ConfigModule;
  const raw = hasConfigExport(mod) ? (mod.default ?? mod.config) : mod;

  if (!raw) {
    throw new Error(
      `Config file "${configPath}" must export a default or named \`config\` from defineConfig(...).`
    );
  }

  const config = defineConfig(raw);
  const configDir = path.dirname(absolutePath);
  const rootDir = config.rootDir ? path.resolve(configDir, config.rootDir) : configDir;

  return {
    config,
    path: absolutePath,
    rootDir,
  };
}
