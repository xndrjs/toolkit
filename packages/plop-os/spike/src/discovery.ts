import fs from "node:fs";
import path from "node:path";

export type Candidate = {
  path: string;
  label: string;
  data: Record<string, string>;
};

export type DiscoveryRule = {
  name: string;
  /** Matched against a posix path relative to the active base directory. */
  pattern: RegExp;
  label?: (match: { path: string; data: Record<string, string> }) => string;
};

export type DiscoveryOptions = {
  roots: string[];
  ignore: string[];
};

const DEFAULT_IGNORE = ["node_modules", "dist", ".git", "coverage"];

export function defaultIgnore(): string[] {
  return [...DEFAULT_IGNORE];
}

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

function walkDirectories(absRoot: string, ignore: string[]): string[] {
  const out: string[] = [];

  function visit(absDir: string): void {
    const rel = toPosix(path.relative(absRoot, absDir));
    if (rel && isIgnored(rel, ignore)) {
      return;
    }
    out.push(absDir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ignore.includes(entry.name)) continue;
      visit(path.join(absDir, entry.name));
    }
  }

  visit(absRoot);
  return out;
}

function namedGroups(match: RegExpMatchArray): Record<string, string> {
  const data: Record<string, string> = {};
  if (match.groups) {
    for (const [key, value] of Object.entries(match.groups)) {
      if (value !== undefined) data[key] = value;
    }
  }
  return data;
}

/**
 * List Candidates for a rule under roots, optionally narrowed by baseDir.
 * baseDir must resolve inside one of the roots.
 */
export function listCandidates(
  options: DiscoveryOptions,
  rule: DiscoveryRule,
  baseDir?: string
): Candidate[] {
  const roots = options.roots.map((r) => path.resolve(r));
  const ignore = options.ignore;

  let walkRoots = roots;
  if (baseDir) {
    const absBase = path.resolve(baseDir);
    const inside = roots.some((root) => absBase === root || absBase.startsWith(root + path.sep));
    if (!inside) {
      throw new Error(`base directory escapes configured roots: ${baseDir}`);
    }
    walkRoots = [absBase];
  }

  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const root of walkRoots) {
    for (const absDir of walkDirectories(root, ignore)) {
      const rel = toPosix(path.relative(root, absDir)) || ".";
      const match = rel.match(rule.pattern);
      if (!match) continue;

      const data = namedGroups(match);
      const candidatePath = toPosix(path.relative(process.cwd(), absDir)) || ".";
      if (seen.has(candidatePath)) continue;
      seen.add(candidatePath);

      const label =
        rule.label?.({ path: candidatePath, data }) ??
        data[Object.keys(data)[0] ?? ""] ??
        candidatePath;

      candidates.push({ path: candidatePath, label, data });
    }
  }

  return candidates;
}

export function findRule(rules: DiscoveryRule[], name: string): DiscoveryRule {
  const rule = rules.find((r) => r.name === name);
  if (!rule) {
    throw new Error(`unknown discovery rule: ${name}`);
  }
  return rule;
}

/** Resolve an explicit path to a Candidate that must appear in the rule's results. */
export function resolveCandidate(
  options: DiscoveryOptions,
  rule: DiscoveryRule,
  inputPath: string,
  baseDir?: string
): Candidate {
  const abs = path.resolve(inputPath);
  const candidates = listCandidates(options, rule, baseDir);
  const hit = candidates.find((c) => path.resolve(c.path) === abs);
  if (!hit) {
    throw new Error(`path is not a valid Candidate for rule "${rule.name}": ${inputPath}`);
  }
  return hit;
}

/** Ensure relativeSubdir stays under candidate.path (no .. escape). */
export function resolveSubdir(candidate: Candidate, relativeSubdir: string): string {
  if (path.isAbsolute(relativeSubdir)) {
    throw new Error(`subdirectory must be relative, got absolute: ${relativeSubdir}`);
  }
  const absCandidate = path.resolve(candidate.path);
  const absTarget = path.resolve(absCandidate, relativeSubdir);
  if (absTarget !== absCandidate && !absTarget.startsWith(absCandidate + path.sep)) {
    throw new Error(`subdirectory escapes candidate path: ${relativeSubdir}`);
  }
  return toPosix(path.relative(process.cwd(), absTarget)) || ".";
}
