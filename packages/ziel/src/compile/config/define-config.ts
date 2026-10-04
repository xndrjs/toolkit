/** Default glob include patterns (relative to `root`). */
export const DEFAULT_ZIEL_INCLUDE = ["**/*.ziel"] as const;

/** Default glob exclude patterns (relative to `root`). */
export const DEFAULT_ZIEL_EXCLUDE = ["**/node_modules/**"] as const;

/**
 * Single-target codegen config (one `out` directory per file / script).
 * Multi-target = multiple config files or scripts.
 */
export type ZielCodegenConfig = {
  /** Directory for globs and relative paths; defaults to `process.cwd()` at collect/CLI time. */
  root?: string;
  /** Glob include patterns; defaults to {@link DEFAULT_ZIEL_INCLUDE}. */
  include?: string[];
  /** Glob exclude patterns; defaults to {@link DEFAULT_ZIEL_EXCLUDE}. */
  exclude?: string[];
  /**
   * Optional filter on the posix path relative to `root` after the glob.
   * A string is treated as a `RegExp` source.
   */
  pathFilter?: string | RegExp;
  /**
   * Output **directory** for multi-file codegen (`resources.ts`, `*.query.ts`,
   * `index.ts`). Must not end in `.ts` / `.js`. The CLI rejects an existing
   * non-directory path at that location.
   */
  out?: string;
  /** Module specifier for runtime imports in generated code → `generateResources`. */
  importFrom?: string;
  /** Name of the emitted registry type → `generateResources`. */
  registryTypeName?: string;
  /**
   * Optional property name stamped with the resource name on projection shells
   * and types (e.g. `"$type"` or `"__resource"`). Default: unset (no stamp).
   */
  resourceTag?: string;
  /**
   * When the program declares ≥1 datasource, require every resource to appear
   * in at least one `for` route (`RESOURCE_MISSING_DATASOURCE`). Default: `true`.
   */
  requireDatasourceCoverage?: boolean;
};

/**
 * Normalize a codegen config: fills `include` / `exclude` /
 * `requireDatasourceCoverage` defaults.
 * Identity for other fields (resolved later by collect / generateResources / CLI).
 */
export function defineConfig(config: ZielCodegenConfig): ZielCodegenConfig {
  return {
    ...config,
    include: config.include ?? [...DEFAULT_ZIEL_INCLUDE],
    exclude: config.exclude ?? [...DEFAULT_ZIEL_EXCLUDE],
    requireDatasourceCoverage: config.requireDatasourceCoverage ?? true,
  };
}
