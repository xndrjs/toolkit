#!/usr/bin/env node
/**
 * Non-interactive walkthrough of plop-os demo cases.
 * Runs in place under apps/plop-os-demo so you can inspect the resulting files.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// Resolve package root via the main export (package.json "exports" blocks ./package.json).
const plopOsEntry = require.resolve("@xndrjs/plop-os");
const plopOsPkgRoot = path.resolve(path.dirname(plopOsEntry), "..");
const plopOsBin = path.join(plopOsPkgRoot, "dist", "cli.js");

const cases = [];

function section(title) {
  console.log(`\n=== ${title} ===`);
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

function main() {
  console.log(`Demo cwd: ${cwd}`);
  console.log(`CLI:      ${plopOsBin}`);

  section("1) Inventory — generators / sync IDs / discovery rules");
  expectOk(runCli(["generators"]), "generators");

  section("2) Discovery — list core-models Candidates");
  expectOk(runCli(["candidates", "--rule", "core-models"]), "candidates core-models");

  section("3) Discovery — narrow with --base");
  expectOk(
    runCli(["candidates", "--rule", "core-models", "--base", "packages/core-billing"]),
    "candidates --base"
  );

  section("4) Discovery — regex hatch (apps)");
  expectOk(runCli(["candidates", "--rule", "apps"]), "candidates apps");

  section("5) Scaffold — new core-package");
  const ordersPkg = path.join(cwd, "packages/core-orders/package.json");
  if (existsSync(ordersPkg)) {
    console.log("packages/core-orders already present — skip scaffold (re-run)");
    cases.push({ label: "run core-package", ok: true, skipped: true });
  } else {
    expectOk(
      runCli(["run", "core-package", "--input", JSON.stringify({ name: "orders" })]),
      "run core-package"
    );
    console.log("created packages/core-orders/…");
  }

  section("6) Scaffold — model in subdirectory under Candidate");
  const hero = path.join(cwd, "packages/core-pagebuilder/models/strips/hero.model.ts");
  if (existsSync(hero)) {
    console.log("hero.model.ts already present — skip scaffold (re-run)");
    console.log(readFileSync(hero, "utf8").trim());
    cases.push({ label: "run model subdir", ok: true, skipped: true });
  } else {
    expectOk(
      runCli([
        "run",
        "model",
        "--input",
        JSON.stringify({
          modelsPath: "packages/core-pagebuilder/models",
          subdir: "strips",
          name: "hero",
        }),
      ]),
      "run model subdir"
    );
    console.log(readFileSync(hero, "utf8").trim());
  }

  section("7) Fail — model into operations/ (not a Candidate)");
  expectFail(
    runCli([
      "run",
      "model",
      "--input",
      JSON.stringify({
        modelsPath: "packages/core-pagebuilder/operations",
        subdir: "",
        name: "nope",
      }),
    ]),
    "reject operations path",
    /modelsPath.*not a valid Candidate|not a valid Candidate.*core-models/i
  );

  section("8) Fail — missing / invalid inputs (no stdin hang)");
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

  section("9) Fail — conflict throw when note already exists");
  const note = path.join(cwd, "notes/hello.txt");
  if (!existsSync(note)) {
    expectOk(
      runCli(["run", "note", "--input", JSON.stringify({ name: "hello" })]),
      "run note first"
    );
  } else {
    console.log("notes/hello.txt already present — go straight to conflict");
    cases.push({ label: "run note first", ok: true, skipped: true });
  }
  expectFail(
    runCli(["run", "note", "--input", JSON.stringify({ name: "hello" })]),
    "note conflict",
    /./
  );

  section("10) Sync — models-barrel (multi-package)");
  expectOk(runCli(["sync", "--id", "models-barrel"]), "sync models-barrel");
  console.log("--- pagebuilder barrel ---");
  console.log(readFileSync(path.join(cwd, "packages/core-pagebuilder/models/index.ts"), "utf8"));
  console.log("--- billing barrel ---");
  console.log(readFileSync(path.join(cwd, "packages/core-billing/models/index.ts"), "utf8"));
  if (existsSync(path.join(cwd, "packages/core-orders/models/index.ts"))) {
    console.log("--- orders barrel (scaffolded) ---");
    console.log(readFileSync(path.join(cwd, "packages/core-orders/models/index.ts"), "utf8"));
  }

  section("11) Sync — core-catalog via Discovery in generator ctx");
  expectOk(runCli(["sync", "--id", "core-catalog"]), "sync core-catalog");
  console.log(readFileSync(path.join(cwd, "CATALOG.md"), "utf8"));

  section("12) Sync — --base limits the pass");
  expectOk(
    runCli(["sync", "--id", "models-barrel", "--base", "packages/core-billing"]),
    "sync --base"
  );

  console.log("\nAll cases passed:");
  for (const c of cases) {
    const tag = c.failedAsExpected ? " (expected failure)" : c.skipped ? " (skipped)" : "";
    console.log(`  ✓ ${c.label}${tag}`);
  }
  console.log(`\nInspect results under ${cwd}`);
}

main();
