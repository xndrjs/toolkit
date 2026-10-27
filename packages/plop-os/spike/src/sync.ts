import fs from "node:fs";
import path from "node:path";

import type { Candidate, DiscoveryOptions, DiscoveryRule } from "./discovery.js";
import { listCandidates } from "./discovery.js";

export type SyncContext = {
  filePath: string;
  syncId: string;
  discovery: {
    listCandidates: (ruleName: string, baseDir?: string) => Candidate[];
  };
};

export type SyncGenerator = (ctx: SyncContext) => string | Promise<string>;

type Region = {
  filePath: string;
  syncId: string;
  startLine: number;
  endLine: number;
  bodyStart: number;
  bodyEnd: number;
};

const MARKER_RE = /^(\s*)(?:\/\/|#)\s*plop-os-sync\s+(start|end)\s+(\S+)\s*$/;

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function isIgnored(relPosix: string, ignore: string[]): boolean {
  const parts = relPosix.split("/");
  return ignore.some((entry) => {
    const clean = entry.replace(/\/\*\*$/, "").replace(/\/$/, "");
    return parts.includes(clean) || relPosix === clean || relPosix.startsWith(`${clean}/`);
  });
}

function walkFiles(absRoot: string, ignore: string[]): string[] {
  const out: string[] = [];

  function visit(absDir: string): void {
    const rel = toPosix(path.relative(absRoot, absDir));
    if (rel && isIgnored(rel, ignore)) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (ignore.includes(entry.name)) continue;
        visit(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileRel = toPosix(path.relative(absRoot, abs));
      if (isIgnored(fileRel, ignore)) continue;
      out.push(abs);
    }
  }

  visit(absRoot);
  return out;
}

export function findRegionsInFile(filePath: string, content: string): Region[] {
  const lines = content.split(/\r?\n/);
  const regions: Region[] = [];
  const open = new Map<string, { startLine: number; bodyStart: number }>();

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(MARKER_RE);
    if (!m) continue;
    const kind = m[2] as "start" | "end";
    const syncId = m[3]!;

    if (kind === "start") {
      if (open.size > 0) {
        throw new Error(
          `${filePath}:${i + 1}: nested regions are not allowed (open: ${[...open.keys()].join(", ")})`
        );
      }
      open.set(syncId, { startLine: i, bodyStart: i + 1 });
      continue;
    }

    const started = open.get(syncId);
    if (!started) {
      throw new Error(`${filePath}:${i + 1}: end without start for sync id "${syncId}"`);
    }
    open.delete(syncId);
    regions.push({
      filePath,
      syncId,
      startLine: started.startLine,
      endLine: i,
      bodyStart: started.bodyStart,
      bodyEnd: i,
    });
  }

  if (open.size > 0) {
    throw new Error(`${filePath}: unclosed region(s): ${[...open.keys()].join(", ")}`);
  }

  return regions;
}

export type SyncPassResult = {
  filesWritten: string[];
  regionsUpdated: number;
};

export async function runSyncPass(args: {
  discovery: DiscoveryOptions;
  rules: DiscoveryRule[];
  generators: Map<string, SyncGenerator>;
  syncId?: string;
  baseDir?: string;
}): Promise<SyncPassResult> {
  const roots = args.discovery.roots.map((r) => path.resolve(r));
  let walkRoots = roots;
  if (args.baseDir) {
    const absBase = path.resolve(args.baseDir);
    const inside = roots.some((root) => absBase === root || absBase.startsWith(root + path.sep));
    if (!inside) {
      throw new Error(`base directory escapes configured roots: ${args.baseDir}`);
    }
    walkRoots = [absBase];
  }

  const files = walkRoots.flatMap((root) => walkFiles(root, args.discovery.ignore));
  const selected: Region[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (!content.includes("plop-os-sync")) continue;
    for (const region of findRegionsInFile(file, content)) {
      if (args.syncId && region.syncId !== args.syncId) continue;
      selected.push(region);
    }
  }

  for (const region of selected) {
    if (!args.generators.has(region.syncId)) {
      throw new Error(
        `no sync generator registered for id "${region.syncId}" (in ${region.filePath})`
      );
    }
  }

  const ruleByName = new Map(args.rules.map((r) => [r.name, r]));
  const bodies = new Map<Region, string>();

  for (const region of selected) {
    const generator = args.generators.get(region.syncId)!;
    const ctx: SyncContext = {
      filePath: region.filePath,
      syncId: region.syncId,
      discovery: {
        listCandidates: (ruleName, baseDir) => {
          const rule = ruleByName.get(ruleName);
          if (!rule) throw new Error(`unknown discovery rule: ${ruleName}`);
          return listCandidates(args.discovery, rule, baseDir);
        },
      },
    };
    const body = await generator(ctx);
    if (typeof body !== "string") {
      throw new Error(`sync generator "${region.syncId}" must return a string`);
    }
    bodies.set(region, body);
  }

  const writes = new Map<string, string>();
  for (const file of new Set(selected.map((r) => r.filePath))) {
    const original = fs.readFileSync(file, "utf8");
    let nextLines = original.split(/\r?\n/);
    const fileRegions = selected
      .filter((r) => r.filePath === file)
      .sort((a, b) => b.startLine - a.startLine);

    for (const region of fileRegions) {
      const bodyLines = bodies
        .get(region)!
        .replace(/\r?\n$/, "")
        .split(/\r?\n/);
      nextLines = [
        ...nextLines.slice(0, region.bodyStart),
        ...bodyLines,
        ...nextLines.slice(region.bodyEnd),
      ];
    }
    writes.set(file, nextLines.join("\n"));
  }

  for (const [file, content] of writes) {
    fs.writeFileSync(file, content, "utf8");
  }

  return {
    filesWritten: [...writes.keys()],
    regionsUpdated: selected.length,
  };
}
