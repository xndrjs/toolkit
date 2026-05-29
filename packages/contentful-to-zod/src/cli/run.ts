import { writeFile } from "node:fs/promises";

import { fetchContentTypes } from "../client/fetch-content-types";
import { fetchLocales } from "../client/fetch-locales";
import type { ContentfulToZodConfig } from "../config/define-config";
import { resolveLocaleMode } from "../config/define-config";
import { generateZodSchemas } from "../emit/generate-file";
import {
  parseCliArgs,
  printCliHelp,
  requireLocalesSnapshot,
  validateCliOptions,
  type CliOptions,
} from "./args";
import { loadConfigFile } from "./load-config";
import {
  ensureParentDir,
  readContentTypesSnapshot,
  readLocalesSnapshot,
  writeContentTypesSnapshot,
  writeLocalesSnapshot,
} from "./load-snapshots";

async function loadFromSnapshots(options: CliOptions, config: ContentfulToZodConfig | undefined) {
  const contentTypes = await readContentTypesSnapshot(options.snapshot!);
  const localeMode = resolveLocaleMode({ config });
  requireLocalesSnapshot(localeMode, options.snapshotLocales);

  const locales = options.snapshotLocales
    ? await readLocalesSnapshot(options.snapshotLocales)
    : undefined;

  return { contentTypes, locales, config };
}

async function fetchFromCma(options: CliOptions, config: ContentfulToZodConfig | undefined) {
  const cma = {
    spaceId: options.spaceId!,
    accessToken: options.managementToken!,
    environmentId: options.environmentId,
  };

  const localeMode = resolveLocaleMode({ config });
  const needsLocales = localeMode === "delivery" || localeMode === "both";

  const [contentTypes, locales] = await Promise.all([
    fetchContentTypes(cma),
    needsLocales ? fetchLocales(cma) : Promise.resolve(undefined),
  ]);

  if (options.snapshot) {
    await writeContentTypesSnapshot(options.snapshot, contentTypes);
  }

  if (options.snapshotLocales && locales) {
    await writeLocalesSnapshot(options.snapshotLocales, locales);
  }

  return { contentTypes, locales, config };
}

export async function runCli(argv: string[]): Promise<number> {
  const options = parseCliArgs(argv);

  if (options.help) {
    printCliHelp();
    return 0;
  }

  const config = options.configPath ? await loadConfigFile(options.configPath) : undefined;
  validateCliOptions(options, config);

  const { contentTypes, locales } = options.fromSnapshot
    ? await loadFromSnapshots(options, config)
    : await fetchFromCma(options, config);

  const source = generateZodSchemas(contentTypes, {
    contentTypeIds: options.contentTypeIds,
    locales,
    config,
  });

  if (options.dryRun) {
    process.stdout.write(source);
    return 0;
  }

  await ensureParentDir(options.out!);
  await writeFile(options.out!, source, "utf8");
  return 0;
}
