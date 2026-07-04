#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const script = join(dirname(fileURLToPath(import.meta.url)), "../src/setup/setup-i18n.ts");

const result = spawnSync("tsx", [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

process.exit(result.status ?? 1);
