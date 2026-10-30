import { runCli } from "./cli";

runCli(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.stack : String(error);
  console.error(`[forma-bench] ${message}`);
  process.exitCode = 1;
});
