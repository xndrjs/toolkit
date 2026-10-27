import { runCli } from "./cli/run.js";

runCli(process.argv.slice(2)).then((code) => {
  if (code !== 0) {
    process.exit(code);
  }
});
