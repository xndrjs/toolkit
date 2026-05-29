import { parseArgs } from "node:util";

import { DEFAULT_ENVIRONMENT_ID } from "../client/cma-params";
import { resolveLocaleMode } from "../config/define-config";
import type { ContentfulToZodConfig } from "../config/define-config";

export interface CliOptions {
  spaceId: string | undefined;
  environmentId: string;
  managementToken: string | undefined;
  out: string | undefined;
  snapshot: string | undefined;
  snapshotLocales: string | undefined;
  fromSnapshot: boolean;
  contentTypeIds: string[] | undefined;
  configPath: string | undefined;
  dryRun: boolean;
  help: boolean;
}

const ENV = {
  managementToken: "CONTENTFUL_MANAGEMENT_TOKEN",
  spaceId: "CONTENTFUL_SPACE_ID",
  environment: "CONTENTFUL_ENVIRONMENT",
} as const;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function parseContentTypes(value: string | undefined): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return ids.length ? ids : undefined;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "space-id": { type: "string" },
      environment: { type: "string" },
      "management-token": { type: "string" },
      out: { type: "string" },
      snapshot: { type: "string" },
      "snapshot-locales": { type: "string" },
      "from-snapshot": { type: "boolean", default: false },
      "content-types": { type: "string" },
      config: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  return {
    spaceId: values["space-id"] ?? readEnv(ENV.spaceId),
    environmentId: values.environment ?? readEnv(ENV.environment) ?? DEFAULT_ENVIRONMENT_ID,
    managementToken: values["management-token"] ?? readEnv(ENV.managementToken),
    out: values.out,
    snapshot: values.snapshot,
    snapshotLocales: values["snapshot-locales"],
    fromSnapshot: values["from-snapshot"] ?? false,
    contentTypeIds: parseContentTypes(values["content-types"]),
    configPath: values.config,
    dryRun: values["dry-run"] ?? false,
    help: values.help ?? false,
  };
}

export function printCliHelp(): void {
  console.log(`contentful-to-zod — generate Zod schemas from Contentful content types

Usage:
  contentful-to-zod --space-id <id> --management-token <token> --out <file.ts>
  contentful-to-zod --from-snapshot --snapshot <types.json> --snapshot-locales <locales.json> --out <file.ts>

Options:
  --space-id <id>              Contentful space ID (env: CONTENTFUL_SPACE_ID)
  --environment <id>           Environment ID (default: master; env: CONTENTFUL_ENVIRONMENT)
  --management-token <token>   CMA token (env: CONTENTFUL_MANAGEMENT_TOKEN)
  --out <path>                 Output TypeScript file (required unless --dry-run)
  --snapshot <path>            Content types snapshot JSON (read with --from-snapshot; write after fetch)
  --snapshot-locales <path>    Locales snapshot JSON (read/write; required for delivery/both when using snapshots)
  --from-snapshot              Load content types and locales from snapshot files instead of the API
  --content-types <ids>        Comma-separated content type IDs to include
  --config <path>              Path to contentful-to-zod.config.ts (default export)
  --dry-run                    Print generated source to stdout instead of writing --out
  -h, --help                   Show this help
`);
}

export function requireLocalesSnapshot(
  localeMode: ReturnType<typeof resolveLocaleMode>,
  snapshotLocales: string | undefined
): void {
  if (localeMode === "cma") {
    return;
  }

  if (!snapshotLocales) {
    throw new Error(
      `--snapshot-locales is required when locale mode is "${localeMode}" (set in config or default "both").`
    );
  }
}

export function validateCliOptions(
  options: CliOptions,
  config: ContentfulToZodConfig | undefined
): void {
  const localeMode = resolveLocaleMode({ config });

  if (options.help) {
    return;
  }

  if (!options.dryRun && !options.out) {
    throw new Error("--out is required unless --dry-run is set.");
  }

  if (options.fromSnapshot) {
    if (!options.snapshot) {
      throw new Error("--snapshot is required when using --from-snapshot.");
    }
    requireLocalesSnapshot(localeMode, options.snapshotLocales);
    return;
  }

  if (!options.spaceId) {
    throw new Error(
      "--space-id is required (or set CONTENTFUL_SPACE_ID) when not using --from-snapshot."
    );
  }

  if (!options.managementToken) {
    throw new Error(
      "--management-token is required (or set CONTENTFUL_MANAGEMENT_TOKEN) when not using --from-snapshot."
    );
  }

  if (options.snapshotLocales && localeMode === "cma") {
    // Locales snapshot path is only used for delivery/both; warn is noisy — skip.
  }
}
