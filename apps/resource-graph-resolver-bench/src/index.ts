import { runCli } from "./cli";

runCli(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[resource-graph-resolver-bench] ${message}`);
    process.exitCode = 1;
  });
