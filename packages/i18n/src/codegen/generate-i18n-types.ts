/**
 * Codegen CLI entry point. Thin wrapper around {@link runCodegen}.
 */
import path from "node:path";
import { runCodegen } from "./run-codegen.js";

function main() {
  const configArgIndex = process.argv.indexOf("--config");
  const configPath =
    configArgIndex >= 0 ? process.argv[configArgIndex + 1]! : "i18n/i18n.codegen.json";

  runCodegen(path.resolve(process.cwd(), configPath));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
