import fs from "node:fs";
import path from "node:path";
import { match as pathToRegexpMatch, type MatchFunction } from "path-to-regexp";

export type CandidateData = Record<string, string>;

/** Strip path-to-regexp param modifiers (`?`, `+`, `*`, custom regex, …). */
type CleanPathParam<P extends string> = P extends `${infer Name}${";" | "("}${string}`
  ? Name
  : P extends `${infer Name}?` | `${infer Name}+` | `${infer Name}*`
    ? Name
    : P;

/** Named `:param` tokens in a path-to-regexp pattern string. */
export type PathParamNames<S extends string> = S extends `${string}:${infer Rest}`
  ? Rest extends `${infer Param}/${infer After}`
    ? CleanPathParam<Param> | PathParamNames<`${After}`>
    : CleanPathParam<Rest>
  : never;

/** Candidate.data shape inferred from a path-to-regexp pattern string. */
export type DataFromPathPattern<S extends string> = Record<PathParamNames<S>, string>;

/**
 * No known keys — property access requires an explicit `TData` or
 * pattern inference through {@link discoveryRule}.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty key set by design
export type EmptyCandidateData = {};

/**
 * Candidate.data defaults to {@link EmptyCandidateData} so property access is
 * opt-in via `TData` (or pattern inference through {@link discoveryRule}).
 */
export type Candidate<TData extends CandidateData = EmptyCandidateData> = {
  path: string;
  label: string;
  data: TData;
};

export type DiscoveryHit<TData extends CandidateData = EmptyCandidateData> = {
  path: string;
  data: TData;
};

/**
 * Named Discovery rule: enumeration under roots + path → data bind.
 *
 * Bind modes (exactly one):
 * - `pattern: string` — primary `path-to-regexp` bind (e.g. `packages/core-:coreName/models`)
 * - `pattern: RegExp` — escape hatch with named capture groups
 * - `extract` — escape hatch custom `(relPath) => data | null | false`
 */
export type DiscoveryRule<TData extends CandidateData = EmptyCandidateData> = {
  name: string;
  pattern?: string | RegExp;
  extract?: (relPath: string) => TData | null | false;
  label?: (hit: DiscoveryHit<TData>) => string;
  filter?: (hit: DiscoveryHit<TData>) => boolean;
};

type DiscoveryRuleFromPattern<P extends string> = {
  name: string;
  pattern: P;
  extract?: undefined;
  label?: (hit: DiscoveryHit<DataFromPathPattern<P>>) => string;
  filter?: (hit: DiscoveryHit<DataFromPathPattern<P>>) => boolean;
};

/** Infer `Candidate.data` from a path-to-regexp `pattern` string literal. */
export function discoveryRule<const P extends string>(
  rule: DiscoveryRuleFromPattern<P>
): DiscoveryRule<DataFromPathPattern<P>>;
/** Pass through an explicitly typed rule (RegExp / extract / manual `TData`). */
export function discoveryRule<TData extends CandidateData>(
  rule: DiscoveryRule<TData>
): DiscoveryRule<TData>;
export function discoveryRule(rule: DiscoveryRule<CandidateData>): DiscoveryRule<CandidateData> {
  return rule;
}

export type DiscoveryOptions = {
  roots: string[];
  ignore: string[];
};

const DEFAULT_IGNORE = ["node_modules", "dist", ".git", "coverage"];

const matchFnCache = new Map<string, MatchFunction<CandidateData>>();

export function defaultIgnore(): string[] {
  return [...DEFAULT_IGNORE];
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** Absolute path, preferring realpath so symlink roots (e.g. macOS `/var` → `/private/var`) compare equal. */
function resolveComparable(p: string): string {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
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

function namedGroups(match: RegExpMatchArray): CandidateData {
  const data: CandidateData = {};
  if (match.groups) {
    for (const [key, value] of Object.entries(match.groups)) {
      if (value !== undefined) data[key] = value;
    }
  }
  return data;
}

function paramsToData(params: Record<string, string | string[] | undefined>): CandidateData {
  const data: CandidateData = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      data[key] = value;
    } else if (Array.isArray(value)) {
      data[key] = value.join("/");
    }
  }
  return data;
}

function getPathMatchFn(pattern: string): MatchFunction<CandidateData> {
  let fn = matchFnCache.get(pattern);
  if (!fn) {
    fn = pathToRegexpMatch<CandidateData>(pattern, { decode: false });
    matchFnCache.set(pattern, fn);
  }
  return fn;
}

function assertBindMode(rule: { name: string; pattern?: unknown; extract?: unknown }): void {
  const hasPattern = rule.pattern !== undefined;
  const hasExtract = rule.extract !== undefined;
  if (hasPattern === hasExtract) {
    throw new Error(`discovery rule "${rule.name}" must define exactly one of pattern or extract`);
  }
}

function bindRelPath<TData extends CandidateData>(
  rule: DiscoveryRule<TData>,
  relPosix: string
): TData | null {
  assertBindMode(rule);

  if (rule.extract) {
    const result = rule.extract(relPosix);
    if (result === null || result === false) return null;
    return result;
  }

  const pattern = rule.pattern;
  if (typeof pattern === "string") {
    const result = getPathMatchFn(pattern)(relPosix);
    if (!result) return null;
    return paramsToData(result.params as Record<string, string | string[] | undefined>) as TData;
  }

  if (pattern instanceof RegExp) {
    const match = relPosix.match(pattern);
    if (!match) return null;
    return namedGroups(match) as TData;
  }

  return null;
}

function resolveWalkRoots(options: DiscoveryOptions, baseDir?: string): string[] {
  const roots = options.roots.map((r) => path.resolve(r));
  if (!baseDir) return roots;

  const absBase = path.resolve(baseDir);
  const inside = roots.some((root) => isInsideRoot(absBase, root));
  if (!inside) {
    throw new Error(`base directory escapes configured roots: ${baseDir}`);
  }
  return [absBase];
}

function defaultLabel(pathPosix: string, data: CandidateData): string {
  const firstKey = Object.keys(data)[0];
  if (firstKey !== undefined && data[firstKey] !== undefined) {
    return data[firstKey];
  }
  return pathPosix;
}

/**
 * List Candidates for a rule under roots, optionally narrowed by baseDir.
 * baseDir must resolve inside one of the roots.
 */
export function listCandidates<TData extends CandidateData>(
  options: DiscoveryOptions,
  rule: DiscoveryRule<TData>,
  baseDir?: string
): Candidate<TData>[] {
  assertBindMode(rule);

  const ignore = options.ignore;
  const walkRoots = resolveWalkRoots(options, baseDir);
  const seen = new Set<string>();
  const candidates: Candidate<TData>[] = [];

  for (const root of walkRoots) {
    for (const absDir of walkDirectories(root, ignore)) {
      const rel = toPosix(path.relative(root, absDir)) || ".";
      const data = bindRelPath(rule, rel);
      if (!data) continue;

      const candidatePath = toPosix(path.relative(process.cwd(), absDir)) || ".";
      if (seen.has(candidatePath)) continue;

      const hit: DiscoveryHit<TData> = { path: candidatePath, data };
      if (rule.filter && !rule.filter(hit)) continue;

      seen.add(candidatePath);
      candidates.push({
        path: candidatePath,
        label: rule.label?.(hit) ?? defaultLabel(candidatePath, data),
        data,
      });
    }
  }

  return candidates;
}

export function findRule(
  rules: readonly DiscoveryRule<CandidateData>[],
  name: string
): DiscoveryRule<CandidateData> {
  const rule = rules.find((r) => r.name === name);
  if (!rule) {
    throw new Error(`unknown discovery rule: ${name}`);
  }
  return rule;
}

/** Resolve an explicit path to a Candidate that must appear in the rule's results. */
export function resolveCandidate<TData extends CandidateData>(
  options: DiscoveryOptions,
  rule: DiscoveryRule<TData>,
  inputPath: string,
  baseDir?: string
): Candidate<TData> {
  const abs = resolveComparable(inputPath);
  const candidates = listCandidates(options, rule, baseDir);
  const hit = candidates.find((c) => resolveComparable(c.path) === abs);
  if (!hit) {
    throw new Error(`path is not a valid Candidate for rule "${rule.name}": ${inputPath}`);
  }
  return hit;
}

/** Ensure relativeSubdir stays under candidate.path (no .. escape). */
export function resolveSubdir(
  candidate: Pick<Candidate<CandidateData>, "path">,
  relativeSubdir: string
): string {
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
