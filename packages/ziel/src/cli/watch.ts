import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { watch, type FSWatcher } from "chokidar";

export type WatchCodegenPaths = {
  /** Absolute project root watched recursively for `.ziel` inputs. */
  root: string;
  /** Absolute config candidate, even when the file does not exist yet. */
  configPath: string | undefined;
  /** Absolute output path — ignored to avoid regenerate loops. */
  outPath: string | undefined;
};

export type WatchCodegenOptions = WatchCodegenPaths & {
  /** Debounce window for coalescing editor save storms. */
  debounceMs?: number;
  /** Called after debounce when one or more relevant paths change. */
  onChange: (reason: string) => void | Promise<void>;
};

export interface CodegenWatcher {
  /** Atomically replace the watched root/config/output set. */
  reconfigure(paths: WatchCodegenPaths): Promise<void>;
  /** Stop watching and wait for an in-flight callback to finish. */
  close(): Promise<void>;
}

type NormalizedWatchPaths = {
  root: string;
  configPath: string | undefined;
  outPath: string | undefined;
};

type ActiveWatcher = {
  watchers: FSWatcher[];
  paths: NormalizedWatchPaths;
};

const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules"]);

function toPosix(filePath: string): string {
  return filePath.split(sep).join("/");
}

function normalizePaths(paths: WatchCodegenPaths): NormalizedWatchPaths {
  return {
    root: resolve(paths.root),
    configPath: paths.configPath === undefined ? undefined : resolve(paths.configPath),
    outPath: paths.outPath === undefined ? undefined : resolve(paths.outPath),
  };
}

function samePaths(left: NormalizedWatchPaths, right: NormalizedWatchPaths): boolean {
  return (
    left.root === right.root &&
    left.configPath === right.configPath &&
    left.outPath === right.outPath
  );
}

function absoluteWatchPath(filename: string, root: string): string {
  return resolve(isAbsolute(filename) ? filename : resolve(root, filename));
}

function relativePathWithin(root: string, candidate: string): string | undefined {
  const fromRoot = relative(root, candidate);
  if (fromRoot === "") return "";
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    return undefined;
  }
  return fromRoot;
}

function hasIgnoredDirectory(relativePath: string): boolean {
  return relativePath.split(sep).some((part) => IGNORED_DIRECTORY_NAMES.has(part));
}

/**
 * True when a watcher event should trigger codegen.
 * Config files are relevant even outside `root`; ordinary inputs must be `.ziel`
 * files inside `root` and outside ignored directories.
 */
export function isRelevantWatchPath(
  filename: string | null | undefined,
  options: WatchCodegenPaths
): boolean {
  if (filename == null || filename === "") return true;

  const paths = normalizePaths(options);
  const absolute = absoluteWatchPath(filename, paths.root);
  if (paths.outPath === absolute) return false;
  if (paths.configPath === absolute) return true;

  const fromRoot = relativePathWithin(paths.root, absolute);
  return (
    fromRoot !== undefined &&
    fromRoot !== "" &&
    !hasIgnoredDirectory(fromRoot) &&
    absolute.endsWith(".ziel")
  );
}

function isIgnoredByChokidar(
  filename: string,
  stats: { isFile(): boolean } | undefined,
  paths: NormalizedWatchPaths
): boolean {
  const absolute = resolve(filename);
  if (paths.configPath === absolute) return false;
  if (paths.outPath === absolute) return true;

  const fromRoot = relativePathWithin(paths.root, absolute);
  if (fromRoot !== undefined && hasIgnoredDirectory(fromRoot)) return true;

  return stats?.isFile() === true && !absolute.endsWith(".ziel");
}

function watchedDirectories(paths: NormalizedWatchPaths): string[] {
  if (
    paths.configPath === undefined ||
    relativePathWithin(paths.root, paths.configPath) !== undefined
  ) {
    return [paths.root];
  }
  return [paths.root, dirname(paths.configPath)];
}

async function closeQuietly(watcher: FSWatcher): Promise<void> {
  try {
    await watcher.close();
  } catch {
    // A failed replacement must not leave its partially initialized watcher open.
  }
}

async function closeAll(watchers: readonly FSWatcher[]): Promise<void> {
  await Promise.all(watchers.map((watcher) => watcher.close()));
}

async function closeAllQuietly(watchers: readonly FSWatcher[]): Promise<void> {
  await Promise.all(watchers.map(closeQuietly));
}

/**
 * Watch `.ziel` inputs and the config candidate with Chokidar.
 *
 * The returned promise resolves only after Chokidar reports `ready`, so callers
 * cannot miss writes issued immediately after setup. Reconfiguration starts the
 * replacement first and closes the previous watcher only after the replacement
 * is ready.
 */
export async function watchCodegenInputs(options: WatchCodegenOptions): Promise<CodegenWatcher> {
  const debounceMs = options.debounceMs ?? 100;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pendingReasons = new Set<string>();
  let running = Promise.resolve();
  let operation = Promise.resolve();
  let closed = false;

  const schedule = (reason: string): void => {
    if (closed) return;
    pendingReasons.add(reason);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const joinedReason = [...pendingReasons].join(", ");
      pendingReasons.clear();
      const invoke = async (): Promise<void> => options.onChange(joinedReason);
      running = running.then(invoke, invoke).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ziel-codegen: watch regenerate failed: ${message}`);
      });
    }, debounceMs);
  };

  const startWatcher = async (input: WatchCodegenPaths): Promise<ActiveWatcher> => {
    const paths = normalizePaths(input);
    const watchers = watchedDirectories(paths).map((directory, index) => {
      const watcher = watch(directory, {
        atomic: true,
        awaitWriteFinish: {
          stabilityThreshold: Math.max(25, debounceMs),
          pollInterval: 10,
        },
        depth: index === 0 ? undefined : 1,
        ignoreInitial: true,
        ignored: (filename, stats) => isIgnoredByChokidar(filename, stats, paths),
        interval: 20,
        persistent: true,
        // Polling avoids native watcher exhaustion and behaves consistently on
        // Linux, macOS, and Windows. Chokidar still coalesces atomic writes.
        usePolling: true,
      });

      watcher.on("all", (eventName, filename) => {
        if (!isRelevantWatchPath(filename, paths)) return;
        schedule(`${eventName} ${toPosix(filename)}`);
      });
      return watcher;
    });

    try {
      await Promise.all(
        watchers.map(
          (watcher) =>
            new Promise<void>((resolveReady, rejectReady) => {
              const onReady = (): void => {
                watcher.off("error", onInitialError);
                resolveReady();
              };
              const onInitialError = (error: unknown): void => {
                watcher.off("ready", onReady);
                rejectReady(error);
              };
              watcher.once("ready", onReady);
              watcher.once("error", onInitialError);
            })
        )
      );
    } catch (error) {
      await closeAllQuietly(watchers);
      throw error;
    }

    for (const watcher of watchers) {
      watcher.on("error", (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ziel-codegen: watch failed: ${message}`);
      });
    }

    return { watchers, paths };
  };

  let active = await startWatcher(options);

  return {
    reconfigure(nextPaths) {
      if (closed) {
        return Promise.reject(new Error("Cannot reconfigure a closed Ziel codegen watcher"));
      }

      const requested = normalizePaths(nextPaths);
      const perform = async (): Promise<void> => {
        if (closed || samePaths(active.paths, requested)) return;
        const replacement = await startWatcher(requested);
        if (closed) {
          await closeAllQuietly(replacement.watchers);
          return;
        }
        const previous = active;
        active = replacement;
        await closeAll(previous.watchers);
      };

      const result = operation.then(perform, perform);
      operation = result.catch(() => undefined);
      return result;
    },

    async close() {
      if (closed) return;
      closed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      pendingReasons.clear();
      await operation;
      await closeAll(active.watchers);
      await running;
    },
  };
}

/** Wait until the process receives SIGINT or SIGTERM (watch mode keep-alive). */
export function waitForSignal(): Promise<void> {
  return new Promise((resolveWait) => {
    const stop = (): void => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolveWait();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
