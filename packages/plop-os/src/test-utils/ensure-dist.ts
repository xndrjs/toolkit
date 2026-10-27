import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, unlinkSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pkgRoot = path.resolve(import.meta.dirname, "../..");
const distDir = path.join(pkgRoot, "dist");
const indexJs = path.join(distDir, "index.js");
const cliJs = path.join(distDir, "cli.js");
const lockPath = path.join(pkgRoot, ".dist-build.lock");

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* busy wait — sync helper for Vitest beforeAll */
  }
}

function waitForDist(timeoutMs = 60_000): void {
  const start = Date.now();
  while (!existsSync(indexJs) || !existsSync(cliJs)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for plop-os dist build");
    }
    sleepSync(50);
  }
}

/** Build `dist/` once across parallel Vitest workers (exclusive lock file). */
export function ensureDist(): {
  pkgRoot: string;
  runtimeHref: string;
  cliJs: string;
} {
  let lockFd: number | undefined;
  try {
    lockFd = openSync(lockPath, "wx");
  } catch {
    waitForDist();
    return {
      pkgRoot,
      runtimeHref: pathToFileURL(indexJs).href,
      cliJs,
    };
  }

  try {
    execFileSync("pnpm", ["exec", "tsup"], { cwd: pkgRoot, stdio: "pipe" });
    if (!existsSync(indexJs) || !existsSync(cliJs)) {
      throw new Error("plop-os tsup finished without dist/index.js and dist/cli.js");
    }
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
    if (lockFd !== undefined) {
      try {
        closeSync(lockFd);
      } catch {
        /* ignore */
      }
    }
  }

  return {
    pkgRoot,
    runtimeHref: pathToFileURL(indexJs).href,
    cliJs,
  };
}
