import { runCli } from "./cli/run";

const argv = process.argv.slice(2);

runCli(argv)
  .then((code) => {
    if (code !== 0) {
      process.exit(code);
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`gordio: ${message}`);
    process.exit(1);
  });
