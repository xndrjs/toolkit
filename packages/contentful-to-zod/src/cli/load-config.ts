import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { defineConfig, type ContentfulToZodConfig } from "../config/define-config";

export async function loadConfigFile(configPath: string): Promise<ContentfulToZodConfig> {
  const absolute = resolve(configPath);
  const mod = (await import(pathToFileURL(absolute).href)) as {
    default?: ContentfulToZodConfig;
    config?: ContentfulToZodConfig;
  };

  const raw = mod.default ?? mod.config;
  if (!raw) {
    throw new Error(
      `Config file "${configPath}" must export a default or named \`config\` from defineConfig(...).`
    );
  }

  return defineConfig(raw);
}
