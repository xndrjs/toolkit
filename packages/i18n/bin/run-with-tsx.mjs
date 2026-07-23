import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Run a TypeScript entry via tsx in a cross-platform way.
 * Avoids `spawn("tsx")` which fails on Windows (tsx.cmd needs a shell).
 */
export function runWithTsx(script, argv = process.argv.slice(2)) {
  let tsxCli;
  try {
    tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
  } catch {
    try {
      tsxCli = createRequire(join(process.cwd(), "package.json")).resolve("tsx/cli");
    } catch {
      tsxCli = undefined;
    }
  }

  const result = tsxCli
    ? spawnSync(process.execPath, [tsxCli, script, ...argv], {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
      })
    : spawnSync("tsx", [script, ...argv], {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
        // Fallback: Windows cannot exec .cmd shims without a shell.
        shell: process.platform === "win32",
      });

  if (result.error) {
    console.error(result.error.message ?? result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
