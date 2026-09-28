import { watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";

export type WatchCodegenOptions = {
  /** Absolute project root used for globs / recursive watch. */
  root: string;
  /** Absolute config path (reloaded on change when present). */
  configPath: string | undefined;
  /** Absolute output path — ignored to avoid regenerate loops. */
  outPath: string | undefined;
  /** Debounce window for coalescing editor save storms. */
  debounceMs?: number;
  /** Called after debounce when a relevant path changes. */
  onChange: (reason: string) => void | Promise<void>;
};

function toPosix(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

/**
 * True when a watched path should trigger codegen.
 * Any `.ziel` under `root`, the config file, or an unknown event (null filename).
 */
export function isRelevantWatchPath(
  filename: string | null | undefined,
  options: {
    root: string;
    configPath: string | undefined;
    outPath: string | undefined;
  }
): boolean {
  if (filename == null || filename === "") {
    return true;
  }

  const abs = resolve(options.root, filename);
  if (options.outPath !== undefined && abs === resolve(options.outPath)) {
    return false;
  }
  if (options.configPath !== undefined && abs === resolve(options.configPath)) {
    return true;
  }

  return toPosix(filename).endsWith(".ziel") || abs.endsWith(".ziel");
}

/**
 * Watch `root` recursively for `.ziel` / config changes and invoke `onChange`
 * after debounce. Returns a disposer that closes the watcher and clears timers.
 *
 * Falls back to non-recursive watch of `root` when the platform rejects
 * `{ recursive: true }` (rare on older Node / some Linux setups).
 */
export function watchCodegenInputs(options: WatchCodegenOptions): () => void {
  const debounceMs = options.debounceMs ?? 100;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingReason = "change";
  let closed = false;
  let running: Promise<void> | undefined;

  const schedule = (reason: string): void => {
    if (closed) return;
    pendingReason = reason;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const run = async (): Promise<void> => {
        await options.onChange(pendingReason);
      };
      running = (running ?? Promise.resolve()).then(run, run).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ziel-codegen: watch regenerate failed: ${message}`);
      });
    }, debounceMs);
  };

  const onFsEvent = (event: string, filename: string | null): void => {
    if (
      !isRelevantWatchPath(filename, {
        root: options.root,
        configPath: options.configPath,
        outPath: options.outPath,
      })
    ) {
      return;
    }
    const label = filename ? `${event} ${toPosix(filename)}` : event;
    schedule(label);
  };

  let watcher: FSWatcher;
  try {
    watcher = watch(options.root, { recursive: true }, onFsEvent);
  } catch {
    watcher = watch(options.root, onFsEvent);
    console.warn(
      `ziel-codegen: recursive watch unsupported for ${options.root}; watching the root directory only.`
    );
  }

  // Also watch the config when it lives outside `root`.
  let configWatcher: FSWatcher | undefined;
  if (options.configPath !== undefined) {
    const configAbs = resolve(options.configPath);
    const rootAbs = resolve(options.root);
    if (!configAbs.startsWith(rootAbs + "/") && configAbs !== rootAbs) {
      try {
        configWatcher = watch(configAbs, () => schedule(`change ${toPosix(configAbs)}`));
      } catch {
        // Config may appear later; root watch still covers in-tree configs.
      }
    }
  }

  return () => {
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    watcher.close();
    configWatcher?.close();
  };
}

/**
 * Wait until the process receives SIGINT or SIGTERM (watch mode keep-alive).
 */
export function waitForSignal(): Promise<void> {
  return new Promise((resolveWait) => {
    const stop = (): void => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolveWait();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
