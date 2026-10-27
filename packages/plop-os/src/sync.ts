import fs from "node:fs";
import path from "node:path";

import {
  findRule,
  listCandidates,
  resolveCandidate,
  resolveSubdir,
  type Candidate,
  type CandidateData,
  type DiscoveryOptions,
  type DiscoveryRule,
  type EmptyCandidateData,
} from "./discovery.js";

export type SyncDiscoveryApi = {
  listCandidates: <TData extends CandidateData = EmptyCandidateData>(
    ruleName: string,
    baseDir?: string
  ) => Candidate<TData>[];
  resolveCandidate: <TData extends CandidateData = EmptyCandidateData>(
    ruleName: string,
    inputPath: string,
    baseDir?: string
  ) => Candidate<TData>;
  resolveSubdir: (
    candidate: Pick<Candidate<CandidateData>, "path">,
    relativeSubdir: string
  ) => string;
};

/** Per-Region locality plus Discovery bound to the configured roots. */
export type SyncContext = {
  filePath: string;
  syncId: string;
  discovery: SyncDiscoveryApi;
};

export type SyncGenerator = (ctx: SyncContext) => string | Promise<string>;

export type SyncRegion = {
  filePath: string;
  syncId: string;
  /** 0-based line index of the start marker. */
  startLine: number;
  /** 0-based line index of the end marker. */
  endLine: number;
  /** First line index of the replaceable interior (exclusive of start marker). */
  bodyStart: number;
  /** Line index where the end marker begins (exclusive end of interior). */
  bodyEnd: number;
};

export type SyncPassResult = {
  filesWritten: string[];
  regionsUpdated: number;
};

const MARKER_RE = /^(\s*)(?:\/\/|#)\s*plop-os-sync\s+(start|end)\s+(\S+)\s*$/;

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function isInsideRoot(absPath: string, absRoot: string): boolean {
  return absPath === absRoot || absPath.startsWith(absRoot + path.sep);
}

function isIgnored(relPosix: string, ignore: string[]): boolean {
  if (!relPosix || relPosix === ".") return false;
  const parts = relPosix.split("/");
  return ignore.some((entry) => {
    const clean = entry.replace(/\/\*\*$/, "").replace(/\/$/, "");
    return parts.includes(clean) || relPosix === clean || relPosix.startsWith(`${clean}/`);
  });
}

function resolveComparable(p: string): string {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

function resolveWalkRoots(roots: string[], baseDir?: string): string[] {
  // Walk with path.resolve; realpath only for containment (macOS `/var` symlinks).
  const walkRoots = roots.map((r) => path.resolve(r));
  if (!baseDir) return walkRoots;

  const absBase = path.resolve(baseDir);
  const baseComparable = resolveComparable(baseDir);
  const inside = roots.some((root) => isInsideRoot(baseComparable, resolveComparable(root)));
  if (!inside) {
    throw new Error(`base directory escapes configured roots: ${baseDir}`);
  }
  return [absBase];
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

/**
 * Parse `plop-os-sync` regions in a file. Regions must be balanced and non-nested.
 * Diagnostics use `filePath:line` (1-based line numbers).
 */
export function findRegionsInFile(filePath: string, content: string): SyncRegion[] {
  const lines = content.split(/\r?\n/);
  const regions: SyncRegion[] = [];
  const open = new Map<string, { startLine: number; bodyStart: number }>();

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(MARKER_RE);
    if (!m) continue;

    const kind = m[2] as "start" | "end";
    const syncId = m[3]!;
    const lineNo = i + 1;

    if (kind === "start") {
      if (open.size > 0) {
        throw new Error(
          `${filePath}:${lineNo}: nested regions are not allowed (open: ${[...open.keys()].join(", ")})`
        );
      }
      open.set(syncId, { startLine: i, bodyStart: i + 1 });
      continue;
    }

    const started = open.get(syncId);
    if (!started) {
      throw new Error(`${filePath}:${lineNo}: end without start for sync id "${syncId}"`);
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

function createDiscoveryApi(
  options: DiscoveryOptions,
  rules: readonly DiscoveryRule<CandidateData>[]
): SyncDiscoveryApi {
  return {
    listCandidates(ruleName, baseDir) {
      return listCandidates(options, findRule(rules, ruleName), baseDir) as never;
    },
    resolveCandidate(ruleName, inputPath, baseDir) {
      return resolveCandidate(options, findRule(rules, ruleName), inputPath, baseDir) as never;
    },
    resolveSubdir(candidate, relativeSubdir) {
      return resolveSubdir(candidate, relativeSubdir);
    },
  };
}

function applyRegionBodies(
  original: string,
  fileRegions: SyncRegion[],
  bodies: Map<SyncRegion, string>
): string {
  let nextLines = original.split(/\r?\n/);
  // Bottom-up so earlier regions keep stable line indices after later replacements.
  const ordered = [...fileRegions].sort((a, b) => b.startLine - a.startLine);

  for (const region of ordered) {
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

  return nextLines.join("\n");
}

/**
 * Fail-closed Sync pass: scan → validate → compute all bodies → write.
 * Any structural error, missing generator, throw, or non-string result aborts with zero writes.
 */
export async function runSyncPass(args: {
  discovery: DiscoveryOptions;
  rules: readonly DiscoveryRule<CandidateData>[];
  generators: Map<string, SyncGenerator>;
  syncId?: string;
  baseDir?: string;
}): Promise<SyncPassResult> {
  const walkRoots = resolveWalkRoots(args.discovery.roots, args.baseDir);
  const files = walkRoots.flatMap((root) => walkFiles(root, args.discovery.ignore));

  const selected: SyncRegion[] = [];
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

  const discoveryApi = createDiscoveryApi(args.discovery, args.rules);
  const bodies = new Map<SyncRegion, string>();

  for (const region of selected) {
    const generator = args.generators.get(region.syncId)!;
    const ctx: SyncContext = {
      filePath: region.filePath,
      syncId: region.syncId,
      discovery: discoveryApi,
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
    const fileRegions = selected.filter((r) => r.filePath === file);
    writes.set(file, applyRegionBodies(original, fileRegions, bodies));
  }

  for (const [file, content] of writes) {
    fs.writeFileSync(file, content, "utf8");
  }

  return {
    filesWritten: [...writes.keys()],
    regionsUpdated: selected.length,
  };
}
