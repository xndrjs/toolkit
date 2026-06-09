import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { discoverArchitectureGraph } from "../discovery/discover";
import type { ArchitectureGraph } from "../graph/types";
import type { ArchitectureGraphDocument } from "../config/define-config";
import { startViewerServer } from "../viewer/server";

import { parseCliArgs, printCliHelp, validateCliOptions } from "./args";
import { findConfigFile, loadConfigFile } from "./load-config";

export interface RunCliEnvironment {
  cwd?: string;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
}

export async function runCli(argv: string[], env: RunCliEnvironment = {}): Promise<number> {
  const cwd = env.cwd ?? process.cwd();
  const stdout = env.stdout ?? process.stdout;
  const stderr = env.stderr ?? process.stderr;
  const options = parseCliArgs(argv);

  if (options.help) {
    printCliHelp();
    return 0;
  }

  validateCliOptions(options);

  const configPath = options.configPath ?? (await findConfigFile(cwd));
  if (!configPath) {
    throw new Error(
      "gordio dev requires --config or a gordio.config.ts file in the current directory."
    );
  }

  const loaded = await loadConfigFile(configPath, cwd);
  const rootDir = options.rootDir ? path.resolve(cwd, options.rootDir) : loaded.rootDir;
  const graph = await discoverArchitectureGraph({
    rootDir,
    ...(loaded.config.exclude ? { exclude: loaded.config.exclude } : {}),
    matchers: loaded.config.matchers,
  });
  const document = createArchitectureGraphDocument(graph);
  const json = `${JSON.stringify(document, null, 2)}\n`;

  stderr.write(formatDiscoverySummary(graph));

  if (options.out) {
    const outPath = path.resolve(cwd, options.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, json, "utf8");
    stderr.write(`gordio dev: wrote ${path.relative(cwd, outPath) || outPath}\n`);
  }

  if (options.json) {
    stdout.write(json);
  }

  if (!options.json && !options.out) {
    const server = await startViewerServer({
      document,
      ...(loaded.config.schema ? { schema: loaded.config.schema } : {}),
      ...(options.host ? { host: options.host } : {}),
      ...(options.port !== undefined ? { port: options.port } : {}),
    });

    stderr.write(`gordio dev: serving viewer at ${server.url}\n`);
  }

  return 0;
}

export function createArchitectureGraphDocument(
  graph: ArchitectureGraph
): ArchitectureGraphDocument {
  return {
    version: 1,
    graph,
  };
}

function formatDiscoverySummary(graph: ArchitectureGraph): string {
  return `gordio dev: discovered ${graph.boxes.length} boxes, ${graph.nodes.length} nodes, ${graph.edges.length} edges\n`;
}
