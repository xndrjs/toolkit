import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

export interface SpawnWithTsxOptions {
  cwd?: string;
  encoding?: BufferEncoding;
  env?: NodeJS.ProcessEnv;
}

/**
 * Run a TypeScript entry via tsx in a cross-platform way.
 * Mirrors `bin/run-with-tsx.mjs` but returns the spawn result for tests.
 */
export function spawnWithTsx(
  script: string,
  argv: string[],
  options: SpawnWithTsxOptions = {}
): SpawnSyncReturns<string> {
  let tsxCli: string | undefined;
  try {
    tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
  } catch {
    try {
      tsxCli = createRequire(join(process.cwd(), "package.json")).resolve("tsx/cli");
    } catch {
      tsxCli = undefined;
    }
  }

  const spawnOptions = {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    env: options.env ?? process.env,
  } as const;

  if (tsxCli) {
    return spawnSync(process.execPath, [tsxCli, script, ...argv], spawnOptions);
  }

  return spawnSync("tsx", [script, ...argv], {
    ...spawnOptions,
    shell: process.platform === "win32",
  });
}
