import { parseArgs } from "node:util";

export interface CliOptions {
  command: string | undefined;
  configPath: string | undefined;
  rootDir: string | undefined;
  out: string | undefined;
  json: boolean;
  help: boolean;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { positionals, values } = parseArgs({
    args: argv,
    options: {
      config: { type: "string" },
      root: { type: "string" },
      out: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  return {
    command: positionals[0],
    configPath: values.config,
    rootDir: values.root,
    out: values.out,
    json: values.json ?? false,
    help: values.help ?? false,
  };
}

export function printCliHelp(): void {
  console.log(`gordio — inspect architecture graphs

Usage:
  gordio dev --config ./gordio.config.ts --json
  gordio dev --config ./gordio.config.ts --out ./gordio.graph.json

Commands:
  dev                   Run discovery once and produce a graph document

Options:
  --config <path>       Path to gordio.config.ts (default: ./gordio.config.*)
  --root <path>         Override config rootDir for discovery
  --out <path>          Write the graph document JSON to a file
  --json                Print the graph document JSON to stdout
  -h, --help            Show this help
`);
}

export function validateCliOptions(options: CliOptions): void {
  if (options.help) {
    return;
  }

  if (options.command !== "dev") {
    throw new Error(`Unknown command "${options.command ?? ""}". Run \`gordio --help\`.`);
  }
}
