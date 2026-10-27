import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { PlopOs } from "../runtime.js";
import { runScaffold } from "../run-scaffold.js";

export type LoadedPlopfile = {
  plopOs: PlopOs;
  plopfile: string;
};

const PLOPFILE_NAMES = ["plopfile.js", "plopfile.mjs", "plopfile.cjs"] as const;

/**
 * Resolve and load the cwd plopfile. Requires a named `plopOs` export
 * (`createPlopOs` instance). Does not read stdin.
 */
export async function loadPlopfileFromCwd(cwd: string = process.cwd()): Promise<LoadedPlopfile> {
  const found = PLOPFILE_NAMES.map((name) => path.resolve(cwd, name)).find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error("no plopfile found in cwd (expected plopfile.js|mjs|cjs)");
  }

  const mod = await import(pathToFileURL(found).href);
  const plopOs: PlopOs | undefined = mod.plopOs ?? mod.default?.plopOs;
  if (!plopOs) {
    throw new Error("plopfile must export `plopOs` (createPlopOs instance)");
  }
  return { plopOs, plopfile: found };
}

function flagValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  const value = argv[idx + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`missing value for ${name}`);
  }
  return value;
}

/** Resolve `--base` against the CLI cwd (same root used to load the plopfile). */
function resolveBaseDir(cwd: string, base: string | undefined): string | undefined {
  if (base === undefined) return undefined;
  return path.isAbsolute(base) ? base : path.resolve(cwd, base);
}

function printJson(value: unknown, stream: NodeJS.WritableStream = process.stdout): void {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printError(err: unknown, stream: NodeJS.WritableStream = process.stderr): void {
  const message = err instanceof Error ? err.message : String(err);
  stream.write(`${JSON.stringify({ ok: false, error: message })}\n`);
}

/**
 * Machine-friendly CLI entry. Structured JSON on stdout; errors as JSON on
 * stderr with a non-zero exit code. Never waits on stdin.
 */
export async function runCli(
  argv: string[],
  options: {
    cwd?: string;
    stdout?: NodeJS.WritableStream;
    stderr?: NodeJS.WritableStream;
  } = {}
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  try {
    const [cmd, ...rest] = argv;
    if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
      printJson(
        {
          commands: [
            "generators",
            "candidates --rule <name> [--base <dir>]",
            "run <scaffoldGenerator> --input <json>",
            "sync [--id <syncId>] [--base <dir>]",
          ],
        },
        stdout
      );
      return 0;
    }

    const { plopOs, plopfile } = await loadPlopfileFromCwd(cwd);

    if (cmd === "generators") {
      const nodePlop = (await import("node-plop")).default;
      const plop = await nodePlop(plopfile);
      printJson(
        {
          scaffold: plop.getGeneratorList(),
          sync: [...plopOs.syncGenerators.keys()],
          discoveryRules: plopOs.rules.map((r) => r.name),
        },
        stdout
      );
      return 0;
    }

    if (cmd === "candidates") {
      const rule = flagValue(rest, "--rule");
      const base = resolveBaseDir(cwd, flagValue(rest, "--base"));
      if (!rule) {
        throw new Error("usage: plop-os candidates --rule <name> [--base <dir>]");
      }
      printJson(plopOs.candidates(rule, base), stdout);
      return 0;
    }

    if (cmd === "run") {
      const generator = rest[0];
      const inputRaw = flagValue(rest, "--input");
      if (!generator || generator.startsWith("-") || !inputRaw) {
        throw new Error('usage: plop-os run <scaffoldGenerator> --input \'{"name":"..."}\'');
      }
      let answers: Record<string, unknown>;
      try {
        answers = JSON.parse(inputRaw) as Record<string, unknown>;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        throw new Error(`invalid --input JSON: ${detail}`);
      }
      if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
        throw new Error("invalid --input JSON: expected a plain object");
      }
      const result = await runScaffold({ plopfile, generator, answers });
      printJson(result, stdout);
      return 0;
    }

    if (cmd === "sync") {
      const id = flagValue(rest, "--id");
      const base = resolveBaseDir(cwd, flagValue(rest, "--base"));
      const result = await plopOs.sync({ id, baseDir: base });
      printJson(result, stdout);
      return 0;
    }

    throw new Error(`unknown command: ${cmd}`);
  } catch (err) {
    printError(err, stderr);
    return 1;
  }
}
