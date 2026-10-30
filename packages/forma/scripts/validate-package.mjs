import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(packageRoot, "../..");
const fixtureRoot = join(packageRoot, "test/package-consumer");
const temporaryRoot = await mkdtemp(join(tmpdir(), "forma-package-validation-"));
const packDirectory = join(temporaryRoot, "pack");
const consumerDirectory = join(temporaryRoot, "consumer");
const npmEnvironment = { npm_config_cache: join(temporaryRoot, "npm-cache") };

const executable = (name) =>
  process.platform === "win32" && (name === "npm" || name === "pnpm") ? `${name}.cmd` : name;

function run(command, args, options = {}) {
  const cwd = options.cwd ?? repositoryRoot;
  console.log(`\n> ${command} ${args.join(" ")}`);

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable(command), args, {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });

    let stdout = "";
    if (options.capture) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise(stdout);
        return;
      }

      const reason = signal === null ? `exit code ${code}` : `signal ${signal}`;
      rejectPromise(new Error(`${command} ${args.join(" ")} failed with ${reason}`));
    });
  });
}

function assertPackageContents(packResult) {
  assert.equal(packResult.length, 1, "npm pack must produce exactly one tarball");
  const [packedPackage] = packResult;
  const paths = new Set(packedPackage.files.map((file) => file.path));
  const requiredFiles = [
    "package.json",
    "README.md",
    "GLOSSARY.md",
    "LICENSE",
    "dist/index.js",
    "dist/index.d.ts",
  ];

  for (const requiredFile of requiredFiles) {
    assert(paths.has(requiredFile), `published package is missing ${requiredFile}`);
  }

  assert(
    [...paths].some((path) => path.startsWith("docs/adr/") && path.endsWith(".md")),
    "published package is missing its ADR documentation"
  );

  const privatePrefixes = ["src/", "test/", "scripts/", "artifacts/"];
  for (const path of paths) {
    assert(
      !privatePrefixes.some((prefix) => path.startsWith(prefix)),
      `published package unexpectedly contains ${path}`
    );
  }

  return join(packDirectory, packedPackage.filename);
}

async function assertPublishedMarkdownLinks(packResult) {
  const paths = new Set(packResult[0].files.map((file) => file.path));
  const markdownPaths = [...paths].filter((path) => path.endsWith(".md"));
  const inlineLink = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  for (const markdownPath of markdownPaths) {
    const markdown = await readFile(join(packageRoot, markdownPath), "utf8");

    for (const match of markdown.matchAll(inlineLink)) {
      const target = match[1];
      if (/^(?:#|https?:|mailto:)/.test(target)) {
        continue;
      }

      const pathWithoutFragment = decodeURI(target.split(/[?#]/, 1)[0]);
      const targetIsDirectory = pathWithoutFragment.endsWith("/");
      const resolvedTarget = posix
        .normalize(posix.join(posix.dirname(markdownPath), pathWithoutFragment))
        .replace(/\/$/, "");
      const targetExists = targetIsDirectory
        ? [...paths].some((path) => path.startsWith(`${resolvedTarget}/`))
        : paths.has(resolvedTarget);

      assert(
        targetExists,
        `published Markdown link ${markdownPath} -> ${target} does not resolve inside the package`
      );
    }
  }
}

async function createConsumer(tarballPath) {
  await mkdir(consumerDirectory, { recursive: true });
  await cp(fixtureRoot, consumerDirectory, { recursive: true });
  await writeFile(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "forma-package-consumer",
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2
    )}\n`
  );

  await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", tarballPath],
    { cwd: consumerDirectory, env: npmEnvironment }
  );
}

try {
  await mkdir(packDirectory, { recursive: true });
  const packOutput = await run(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", packDirectory],
    { cwd: packageRoot, capture: true, env: npmEnvironment }
  );
  const packResult = JSON.parse(packOutput);
  const tarballPath = assertPackageContents(packResult);
  await assertPublishedMarkdownLinks(packResult);

  console.log(`\nValidated package contents: ${packResult[0].files.length} files`);
  await run("pnpm", ["exec", "publint", tarballPath, "--strict"], { cwd: packageRoot });
  await run("pnpm", ["exec", "attw", tarballPath, "--profile", "esm-only"], {
    cwd: packageRoot,
  });

  await createConsumer(tarballPath);
  await run(
    "pnpm",
    ["exec", "tsc", "--project", join(consumerDirectory, "tsconfig.nodenext.json")],
    {
      cwd: repositoryRoot,
    }
  );
  await run(
    "pnpm",
    ["exec", "tsc", "--project", join(consumerDirectory, "tsconfig.bundler.json")],
    {
      cwd: repositoryRoot,
    }
  );
  await run("node", [join(consumerDirectory, "dist/index.js")], { cwd: consumerDirectory });

  const installedPackage = JSON.parse(
    await readFile(join(consumerDirectory, "node_modules/@xndrjs/forma/package.json"), "utf8")
  );
  assert.equal(installedPackage.name, "@xndrjs/forma");
  assert.equal(installedPackage.version, packResult[0].version);

  console.log("\nForma package validation passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
