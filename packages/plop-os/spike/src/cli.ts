#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runScaffold } from "./run-scaffold.js";

type Loaded = {
  plopOs: import("./runtime.js").PlopOs;
  plopfile: string;
};

async function loadFromCwd(): Promise<Loaded> {
  const candidates = ["plopfile.js", "plopfile.mjs", "plopfile.cjs", "plopfile.ts"];
  const found = candidates
    .map((name) => path.resolve(process.cwd(), name))
    .find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error("no plopfile found in cwd (expected plopfile.js|mjs|cjs)");
  }

  const mod = await import(pathToFileURL(found).href);
  const plopOs = mod.plopOs ?? mod.default?.plopOs;
  if (!plopOs) {
    throw new Error("plopfile must export `plopOs` (createPlopOs instance)");
  }
  return { plopOs, plopfile: found };
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help") {
    printJson({
      commands: [
        "generators",
        "candidates --rule <name> [--base <dir>]",
        "run <scaffoldGenerator> --input <json>",
        "sync [--id <syncId>] [--base <dir>]",
      ],
    });
    return;
  }

  const { plopOs, plopfile } = await loadFromCwd();

  if (cmd === "generators") {
    const nodePlop = (await import("node-plop")).default;
    const plop = await nodePlop(plopfile);
    printJson({
      scaffold: plop.getGeneratorList(),
      sync: [...plopOs.syncGenerators.keys()],
      discoveryRules: plopOs.rules.map((r) => r.name),
    });
    return;
  }

  if (cmd === "candidates") {
    const ruleIdx = rest.indexOf("--rule");
    const baseIdx = rest.indexOf("--base");
    const rule = ruleIdx >= 0 ? rest[ruleIdx + 1] : undefined;
    const base = baseIdx >= 0 ? rest[baseIdx + 1] : undefined;
    if (!rule) throw new Error("usage: plop-os candidates --rule <name> [--base <dir>]");
    printJson(plopOs.candidates(rule, base));
    return;
  }

  if (cmd === "run") {
    const generator = rest[0];
    const inputIdx = rest.indexOf("--input");
    const inputRaw = inputIdx >= 0 ? rest[inputIdx + 1] : undefined;
    if (!generator || !inputRaw) {
      throw new Error('usage: plop-os run <generator> --input \'{"name":"..."}\'');
    }
    const answers = JSON.parse(inputRaw) as Record<string, unknown>;
    const result = await runScaffold({ plopfile, generator, answers });
    printJson(result);
    return;
  }

  if (cmd === "sync") {
    const idIdx = rest.indexOf("--id");
    const baseIdx = rest.indexOf("--base");
    const id = idIdx >= 0 ? rest[idIdx + 1] : undefined;
    const base = baseIdx >= 0 ? rest[baseIdx + 1] : undefined;
    const result = await plopOs.sync({ id, baseDir: base });
    printJson(result);
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main(process.argv.slice(2)).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = 1;
});
