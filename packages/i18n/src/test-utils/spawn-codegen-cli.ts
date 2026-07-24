import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

export interface SpawnCodegenCliOptions {
  cwd?: string;
  encoding?: BufferEncoding;
  env?: NodeJS.ProcessEnv;
}

/** Run the compiled codegen CLI via node (cross-platform). */
export function spawnCodegenCli(
  argv: string[],
  options: SpawnCodegenCliOptions = {}
): SpawnSyncReturns<string> {
  const cliScript = join(packageRoot, "dist/cli/codegen.js");

  return spawnSync(process.execPath, [cliScript, ...argv], {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    env: options.env ?? process.env,
  });
}
