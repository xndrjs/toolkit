#!/usr/bin/env node
/**
 * Non-interactive walkthrough of plop-os demo cases.
 * Starts from an empty workspace (wipes prior generated trees), then populates
 * everything via Scaffold / Sync so you can watch the repo fill in place.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { GENERATED, clearGenerated, demoRoot as cwd } from "./generated-paths.mjs";

const require = createRequire(import.meta.url);
const plopOsEntry = require.resolve("@xndrjs/plop-os");
const plopOsPkgRoot = path.resolve(path.dirname(plopOsEntry), "..");
const plopOsBin = path.join(plopOsPkgRoot, "dist", "cli.js");

const cases = [];

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function resetGenerated() {
  const removed = clearGenerated(cwd);
  console.log(
    removed.length
      ? `Reset generated paths: ${removed.join(", ")}`
      : `No prior generated paths (${GENERATED.join(", ")})`
  );
}

function runCli(args) {
  try {
    const out = execFileSync(process.execPath, [plopOsBin, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout: out, stderr: "" };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString?.() ?? "",
      stderr: err.stderr?.toString?.() ?? "",
    };
  }
}

function expectOk(result, label) {
  if (result.code !== 0) {
    throw new Error(`${label} failed (${result.code}): ${result.stderr || result.stdout}`);
  }
  cases.push({ label, ok: true });
  if (result.stdout.trim()) console.log(result.stdout.trim());
}

function expectFail(result, label, pattern) {
  if (result.code === 0) {
    throw new Error(`${label}: expected non-zero exit`);
  }
  const blob = `${result.stderr}\n${result.stdout}`;
  if (pattern && !pattern.test(blob)) {
    throw new Error(`${label}: expected error matching ${pattern}, got: ${blob}`);
  }
  cases.push({ label, ok: true, failedAsExpected: true });
  console.log(result.stderr.trim() || result.stdout.trim());
}

function run(generator, input, label) {
  const args = ["run", generator, "--input", JSON.stringify(input)];
  expectOk(runCli(args), label);
}

function main() {
  console.log(`Demo cwd: ${cwd}`);
  console.log(`CLI:      ${plopOsBin}`);
  resetGenerated();

  section("1) Inventory — generators / sync IDs / discovery rules");
  expectOk(runCli(["generators"]), "generators");

  section("2) Discovery — empty workspace (no Candidates yet)");
  expectOk(runCli(["candidates", "--rule", "core-models"]), "candidates empty");

  section("3) Scaffold — core packages (pagebuilder, billing)");
  run("core-package", { name: "pagebuilder" }, "scaffold pagebuilder");
  run("core-package", { name: "billing" }, "scaffold billing");

  section("4) Discovery — core-models Candidates appear");
  expectOk(runCli(["candidates", "--rule", "core-models"]), "candidates core-models");

  section("5) Discovery — narrow with --base");
  expectOk(
    runCli(["candidates", "--rule", "core-models", "--base", "packages/core-billing"]),
    "candidates --base"
  );

  section("6) Scaffold — app (regex Discovery hatch)");
  run("app", { name: "demo-shell" }, "scaffold app");
  expectOk(runCli(["candidates", "--rule", "apps"]), "candidates apps");

  section("7) Scaffold — models (list: core → dest dir under models/)");
  run(
    "model",
    {
      modelsPath: "packages/core-billing/models",
      destPath: "packages/core-billing/models",
      name: "invoice",
    },
    "scaffold invoice model"
  );
  run(
    "model",
    {
      modelsPath: "packages/core-pagebuilder/models",
      destPath: "packages/core-pagebuilder/models",
      name: "existing",
    },
    "scaffold existing model"
  );
  // Nested dest must already exist as a directory Candidate (kind: directory).
  mkdirSync(path.join(cwd, "packages/core-pagebuilder/models/strips"), { recursive: true });
  run(
    "model",
    {
      modelsPath: "packages/core-pagebuilder/models",
      destPath: "packages/core-pagebuilder/models/strips",
      name: "hero",
    },
    "scaffold hero model in strips/"
  );
  console.log(
    readFileSync(
      path.join(cwd, "packages/core-pagebuilder/models/strips/hero.model.ts"),
      "utf8"
    ).trim()
  );

  section("7b) Discovery — model-files (kind: file) and models-dirs");
  expectOk(runCli(["candidates", "--rule", "model-files"]), "candidates model-files");
  expectOk(
    runCli(["candidates", "--rule", "models-dirs", "--base", "packages/core-pagebuilder/models"]),
    "candidates models-dirs --base"
  );

  section("8) Fail — model into operations/ (not a Candidate)");
  expectFail(
    runCli([
      "run",
      "model",
      "--input",
      JSON.stringify({
        modelsPath: "packages/core-pagebuilder/operations",
        destPath: "packages/core-pagebuilder/operations",
        name: "nope",
      }),
    ]),
    "reject operations path",
    /modelsPath.*not a valid Candidate|not a valid Candidate.*core-models/i
  );

  section("9) Fail — missing / invalid inputs (no stdin hang)");
  expectFail(
    runCli(["run", "core-package", "--input", "{}"]),
    "missing name",
    /missing required inputs/i
  );
  expectFail(
    runCli(["run", "core-package", "--input", JSON.stringify({ name: "NotKebab" })]),
    "invalid name",
    /invalid input .{0,2}name|kebab-case/i
  );

  section("10) Fail — conflict throw when note already exists");
  run("note", { name: "hello" }, "run note first");
  expectFail(
    runCli(["run", "note", "--input", JSON.stringify({ name: "hello" })]),
    "note conflict",
    /./
  );

  section("11) Scaffold — CATALOG.md then Sync core-catalog");
  run("catalog", {}, "scaffold catalog");
  expectOk(runCli(["sync", "--id", "core-catalog"]), "sync core-catalog");
  console.log(readFileSync(path.join(cwd, "CATALOG.md"), "utf8"));

  section("12) Sync — models-barrel (fills Region interiors)");
  expectOk(runCli(["sync", "--id", "models-barrel"]), "sync models-barrel");
  console.log("--- pagebuilder barrel ---");
  console.log(readFileSync(path.join(cwd, "packages/core-pagebuilder/models/index.ts"), "utf8"));
  console.log("--- billing barrel ---");
  console.log(readFileSync(path.join(cwd, "packages/core-billing/models/index.ts"), "utf8"));

  section("13) Sync — --base limits the pass");
  expectOk(
    runCli(["sync", "--id", "models-barrel", "--base", "packages/core-billing"]),
    "sync --base"
  );

  console.log("\nAll cases passed:");
  for (const c of cases) {
    const tag = c.failedAsExpected ? " (expected failure)" : "";
    console.log(`  ✓ ${c.label}${tag}`);
  }
  console.log(`\nInspect results under ${cwd}`);
}

main();
