import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  fixtureFileName,
  GUARDED_TYPE_SCALE_SHAPES,
  providerCount,
  shapeKey,
  TYPE_SCALE_SHAPES,
} from "./type-scale-config.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const typescriptVersion = require("typescript/package.json").version;

function runTsc(fixturePath) {
  const executable = process.platform === "win32" ? "tsc.cmd" : "tsc";
  const args = [
    "--noEmit",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--lib",
    "ES2022,DOM,ESNext.Disposable",
    "--strict",
    "--skipLibCheck",
    "false",
    "--extendedDiagnostics",
    fixturePath,
  ];

  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = performance.now();
    const child = spawn(executable, args, { cwd: appRoot, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      resolvePromise({ code, output, wallMs: performance.now() - startedAt });
    });
  });
}

function numericMetric(output, label) {
  const match = output.match(new RegExp(`^${label}:\\s+([\\d,.]+)`, "m"));
  return match ? Number(match[1].replaceAll(",", "")) : 0;
}

function secondsMetric(output, label) {
  const match = output.match(new RegExp(`^${label}:\\s+([\\d.]+)s`, "m"));
  return match ? Number(match[1]) * 1000 : 0;
}

function diagnosticCode(output) {
  const match = output.match(/error (TS\d+):/);
  return match?.[1];
}

const rows = [];
const guardedShapes = new Set(GUARDED_TYPE_SCALE_SHAPES.map(shapeKey));
console.log(`TypeScript ${typescriptVersion} on ${process.version}`);
for (const shape of TYPE_SCALE_SHAPES) {
  const fixturePath = join(appRoot, "type-fixtures", fixtureFileName(shape));
  const { code, output, wallMs } = await runTsc(fixturePath);
  rows.push({
    arity: shape.arity,
    depth: shape.depth,
    providers: providerCount(shape),
    kind: guardedShapes.has(shapeKey(shape)) ? "guard" : "probe",
    passed: code === 0,
    diagnostic: code === 0 ? undefined : (diagnosticCode(output) ?? `exit-${code}`),
    wallMs,
    checkMs: secondsMetric(output, "Check time"),
    totalMs: secondsMetric(output, "Total time"),
    types: numericMetric(output, "Types"),
    instantiations: numericMetric(output, "Instantiations"),
    memoryKb: numericMetric(output, "Memory used"),
  });
}

console.table(
  rows.map((row) => ({
    arity: row.arity,
    depth: row.depth,
    providers: row.providers,
    kind: row.kind,
    status: row.passed ? "pass" : row.diagnostic,
    "wall ms": row.wallMs.toFixed(1),
    "check ms": row.checkMs.toFixed(1),
    "ts total ms": row.totalMs.toFixed(1),
    types: row.types,
    instantiations: row.instantiations,
    "memory KB": row.memoryKb,
  }))
);

const failedGuard = rows.find((row) => row.kind === "guard" && !row.passed);
if (failedGuard) {
  process.exitCode = 1;
  console.error(
    `Guarded a${failedGuard.arity}/d${failedGuard.depth} fixture failed with ${failedGuard.diagnostic}.`
  );
}

const outputIndex = process.argv.indexOf("--output-dir");
if (outputIndex >= 0) {
  const outputArgument = process.argv[outputIndex + 1];
  if (!outputArgument) throw new Error("--output-dir requires a path.");
  const outputDirectory = resolve(appRoot, outputArgument);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, "type-scale.json");
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        runtime: { node: process.version, platform: process.platform, arch: process.arch },
        typescript: typescriptVersion,
        rows,
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${outputPath}`);
}
