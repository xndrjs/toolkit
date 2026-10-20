import { parseArgs } from "node:util";

export type CodegenCliOptions = {
  readonly command: "codegen";
  readonly architecture: string;
  readonly out: string;
  /** Import specifier embedded in the generated file for the architecture module. */
  readonly architectureModule?: string;
  readonly architectureExport: string;
  readonly constructsExport: string;
  readonly strutturaPackage: string;
  readonly help: boolean;
};

export type ApplyCliOptions = {
  readonly command: "apply";
  readonly population: string;
  readonly architectureDir: string;
  readonly materializationRoot: string;
  readonly help: boolean;
};

export type InspectCliOptions = {
  readonly command: "inspect";
  readonly population: string;
  readonly architectureDir: string;
  readonly materializationRoot: string;
  readonly repositoryRoot?: string;
  readonly json: boolean;
  readonly help: boolean;
};

export type MigrateIdCliOptions = {
  readonly command: "migrate-id";
  readonly architectureDir: string;
  readonly from: string;
  readonly to: string;
  readonly help: boolean;
};

export type HelpCliOptions = {
  readonly command: "help";
  readonly help: true;
};

export type CliOptions =
  | CodegenCliOptions
  | ApplyCliOptions
  | InspectCliOptions
  | MigrateIdCliOptions
  | HelpCliOptions;

const COMMANDS = new Set(["codegen", "apply", "inspect", "migrate-id", "help"]);

export function parseCliArgs(argv: string[]): CliOptions {
  const [command, ...rest] = argv;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { command: "help", help: true };
  }
  if (!COMMANDS.has(command)) {
    throw new Error(
      `Unknown command "${command}". Expected codegen | apply | inspect | migrate-id.`
    );
  }

  if (command === "codegen") {
    const { values } = parseArgs({
      args: rest,
      options: {
        architecture: { type: "string" },
        out: { type: "string" },
        "architecture-module": { type: "string" },
        "architecture-export": { type: "string", default: "architecture" },
        "constructs-export": { type: "string", default: "constructs" },
        "struttura-package": { type: "string", default: "@xndrjs/struttura" },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: false,
    });
    if (values.help) {
      return { command: "help", help: true };
    }
    if (!values.architecture) {
      throw new Error("codegen requires --architecture <module>");
    }
    if (!values.out) {
      throw new Error("codegen requires --out <file>");
    }
    return {
      command: "codegen",
      architecture: values.architecture,
      out: values.out,
      architectureModule: values["architecture-module"],
      architectureExport: values["architecture-export"] ?? "architecture",
      constructsExport: values["constructs-export"] ?? "constructs",
      strutturaPackage: values["struttura-package"] ?? "@xndrjs/struttura",
      help: false,
    };
  }

  if (command === "apply") {
    const { values } = parseArgs({
      args: rest,
      options: {
        population: { type: "string" },
        "architecture-dir": { type: "string" },
        "materialization-root": { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: false,
    });
    if (values.help) {
      return { command: "help", help: true };
    }
    requirePopulationPaths(values, "apply");
    return {
      command: "apply",
      population: values.population!,
      architectureDir: values["architecture-dir"]!,
      materializationRoot: values["materialization-root"]!,
      help: false,
    };
  }

  if (command === "inspect") {
    const { values } = parseArgs({
      args: rest,
      options: {
        population: { type: "string" },
        "architecture-dir": { type: "string" },
        "materialization-root": { type: "string" },
        "repository-root": { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: false,
    });
    if (values.help) {
      return { command: "help", help: true };
    }
    requirePopulationPaths(values, "inspect");
    return {
      command: "inspect",
      population: values.population!,
      architectureDir: values["architecture-dir"]!,
      materializationRoot: values["materialization-root"]!,
      repositoryRoot: values["repository-root"],
      json: values.json ?? false,
      help: false,
    };
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      "architecture-dir": { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    return { command: "help", help: true };
  }
  if (!values["architecture-dir"]) {
    throw new Error("migrate-id requires --architecture-dir <dir>");
  }
  if (!values.from) {
    throw new Error("migrate-id requires --from <oldId>");
  }
  if (!values.to) {
    throw new Error("migrate-id requires --to <newId>");
  }
  return {
    command: "migrate-id",
    architectureDir: values["architecture-dir"],
    from: values.from,
    to: values.to,
    help: false,
  };
}

function requirePopulationPaths(
  values: {
    population?: string;
    "architecture-dir"?: string;
    "materialization-root"?: string;
  },
  command: "apply" | "inspect"
): void {
  if (!values.population) {
    throw new Error(`${command} requires --population <module>`);
  }
  if (!values["architecture-dir"]) {
    throw new Error(`${command} requires --architecture-dir <dir>`);
  }
  if (!values["materialization-root"]) {
    throw new Error(`${command} requires --materialization-root <dir>`);
  }
}

export function printCliHelp(): void {
  console.log(`struttura — architecture materialization CLI (wave 1)

Usage:
  struttura codegen --architecture <module.ts> --out <populate-api.ts>
  struttura apply --population <module.ts> --architecture-dir <dir> --materialization-root <dir>
  struttura inspect --population <module.ts> --architecture-dir <dir> --materialization-root <dir> [--json]
  struttura migrate-id --architecture-dir <dir> --from <oldId> --to <newId>

Commands:
  codegen       Emit the typed populate API (never runs as a side effect of apply)
  apply         Reconcile the materialization root and write the success manifest
  inspect       Report plan/diagnostics without writing disk or manifest
  migrate-id    Rewrite an instance id and its references in the success manifest

codegen options:
  --architecture <path>         Module exporting architecture (+ constructs)
  --out <path>                  Generated populate API destination
  --architecture-module <spec>  Import specifier embedded in generated file
                                (default: relative path from --out to --architecture)
  --architecture-export <name>  Named architecture export (default: architecture)
  --constructs-export <name>    Named constructs map export (default: constructs)
  --struttura-package <spec>    Import path for @xndrjs/struttura (default: package name)

apply / inspect options:
  --population <path>           Module exporting population
  --architecture-dir <dir>      Support directory (.struttura/manifest.json)
  --materialization-root <dir>  Artifact create/update/delete perimeter
  --repository-root <dir>       inspect only; defaults to parent of architecture-dir
  --json                        inspect only; print the full report as JSON

migrate-id options:
  --architecture-dir <dir>      Directory containing .struttura/manifest.json
  --from <oldId>                Effective id currently in the manifest
  --to <newId>                  Replacement effective id

  -h, --help                    Show this help
`);
}
