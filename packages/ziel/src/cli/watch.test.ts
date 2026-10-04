import { mkdtempSync, mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { isRelevantWatchPath, watchCodegenInputs, type CodegenWatcher } from "./watch";

function changeCollector(): {
  reasons: string[];
  onChange(reason: string): void;
  next(): Promise<string>;
} {
  const reasons: string[] = [];
  const queued: string[] = [];
  const waiters: ((reason: string) => void)[] = [];

  return {
    reasons,
    onChange(reason) {
      reasons.push(reason);
      const waiter = waiters.shift();
      if (waiter) waiter(reason);
      else queued.push(reason);
    },
    next() {
      const reason = queued.shift();
      if (reason !== undefined) return Promise.resolve(reason);
      return new Promise((resolveNext) => waiters.push(resolveNext));
    },
  };
}

describe("isRelevantWatchPath", () => {
  const root = "/proj";
  const configPath = "/outside/ziel.config.ts";
  const outPath = "/proj/src/generated";

  it("treats null/empty filename as relevant (unknown event)", () => {
    expect(isRelevantWatchPath(null, { root, configPath, outPath })).toBe(true);
    expect(isRelevantWatchPath("", { root, configPath, outPath })).toBe(true);
  });

  it("reacts to nested .ziel paths under root and ignores paths outside it", () => {
    expect(isRelevantWatchPath("ziel/page.ziel", { root, configPath, outPath })).toBe(true);
    expect(isRelevantWatchPath("foo/nested/bar.ziel", { root, configPath, outPath })).toBe(true);
    expect(isRelevantWatchPath("/elsewhere/page.ziel", { root, configPath, outPath })).toBe(false);
  });

  it("reacts to a config file outside the root", () => {
    expect(isRelevantWatchPath(configPath, { root, configPath, outPath })).toBe(true);
  });

  it("ignores the entire out directory, dependency metadata, and unrelated files", () => {
    expect(isRelevantWatchPath(outPath, { root, configPath, outPath })).toBe(false);
    expect(isRelevantWatchPath(`${outPath}/resources.ts`, { root, configPath, outPath })).toBe(
      false
    );
    expect(
      isRelevantWatchPath(`${outPath}/page-detail.query.ts`, { root, configPath, outPath })
    ).toBe(false);
    expect(isRelevantWatchPath("node_modules/pkg/schema.ziel", { root, configPath, outPath })).toBe(
      false
    );
    expect(isRelevantWatchPath(".git/cache/schema.ziel", { root, configPath, outPath })).toBe(
      false
    );
    expect(isRelevantWatchPath("src/app.ts", { root, configPath, outPath })).toBe(false);
  });
});

describe("watchCodegenInputs", () => {
  const tempDirs: string[] = [];
  let controller: CodegenWatcher | undefined;

  function makeTempDir(): string {
    const directory = mkdtempSync(join(tmpdir(), "xndrjs-ziel-watch-"));
    tempDirs.push(directory);
    return directory;
  }

  afterEach(async () => {
    await controller?.close();
    controller = undefined;
    for (const directory of tempDirs.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("is ready before resolving and debounces multiple writes", async () => {
    const root = makeTempDir();
    const zielDir = join(root, "ziel", "nested");
    const input = join(zielDir, "page.ziel");
    mkdirSync(zielDir, { recursive: true });
    writeFileSync(input, "scalar Id on string;\n");
    const changes = changeCollector();

    controller = await watchCodegenInputs({
      root,
      configPath: join(root, "ziel.config.ts"),
      outPath: join(root, "generated"),
      debounceMs: 20,
      onChange: changes.onChange,
    });

    const changed = changes.next();
    writeFileSync(input, "scalar Id on string;\nresource A(id: Id): { id }\n");
    writeFileSync(input, "scalar Id on string;\nresource B(id: Id): { id }\n");

    expect(await changed).toContain("page.ziel");
    expect(changes.reasons).toHaveLength(1);
  });

  it("reports nested add, change, unlink, and atomic-save events", async () => {
    const root = makeTempDir();
    const zielDir = join(root, "schemas", "nested");
    const input = join(zielDir, "page.ziel");
    mkdirSync(zielDir, { recursive: true });
    const changes = changeCollector();

    controller = await watchCodegenInputs({
      root,
      configPath: join(root, "ziel.config.ts"),
      outPath: join(root, "generated"),
      debounceMs: 10,
      onChange: changes.onChange,
    });

    let changed = changes.next();
    writeFileSync(input, "scalar Id on string;\n");
    expect(await changed).toContain("add");

    changed = changes.next();
    writeFileSync(input, "scalar Id on string;\nresource Page(id: Id): { id }\n");
    expect(await changed).toContain("change");

    changed = changes.next();
    unlinkSync(input);
    expect(await changed).toContain("unlink");

    const temporary = join(zielDir, ".page.ziel.tmp");
    changed = changes.next();
    writeFileSync(temporary, "scalar Id on string;\n");
    renameSync(temporary, input);
    expect(await changed).toContain("page.ziel");
  });

  it("watches an external config that does not exist at startup", async () => {
    const root = makeTempDir();
    const configDirectory = makeTempDir();
    const configPath = join(configDirectory, "ziel.config.ts");
    const changes = changeCollector();

    controller = await watchCodegenInputs({
      root,
      configPath,
      outPath: join(root, "generated"),
      debounceMs: 10,
      onChange: changes.onChange,
    });

    const changed = changes.next();
    writeFileSync(configPath, "export default {};\n");
    expect(await changed).toContain("ziel.config.ts");
  });

  it("ignores the out directory, .git, node_modules, and non-Ziel files", async () => {
    const root = makeTempDir();
    const outDir = join(root, "generated");
    const relevant = join(root, "schema.ziel");
    mkdirSync(join(root, ".git", "cache"), { recursive: true });
    mkdirSync(join(root, "node_modules", "dependency"), { recursive: true });
    mkdirSync(outDir, { recursive: true });
    const changes = changeCollector();

    controller = await watchCodegenInputs({
      root,
      configPath: join(root, "ziel.config.ts"),
      outPath: outDir,
      debounceMs: 20,
      onChange: changes.onChange,
    });

    const changed = changes.next();
    writeFileSync(join(outDir, "resources.ts"), "generated\n");
    writeFileSync(join(outDir, "page-detail.query.ts"), "generated\n");
    writeFileSync(join(root, ".git", "cache", "ignored.ziel"), "ignored\n");
    writeFileSync(join(root, "node_modules", "dependency", "ignored.ziel"), "ignored\n");
    writeFileSync(join(root, "source.ts"), "ignored\n");
    writeFileSync(relevant, "scalar Id on string;\n");

    const reason = await changed;
    expect(reason).toContain("schema.ziel");
    expect(reason).not.toMatch(/generated|\.git|node_modules|source\.ts/);
  });

  it("switches root and output only after the replacement is ready", async () => {
    const oldRoot = makeTempDir();
    const newRoot = makeTempDir();
    const changes = changeCollector();

    controller = await watchCodegenInputs({
      root: oldRoot,
      configPath: join(oldRoot, "ziel.config.ts"),
      outPath: join(oldRoot, "generated"),
      debounceMs: 10,
      onChange: changes.onChange,
    });
    await controller.reconfigure({
      root: newRoot,
      configPath: join(newRoot, "ziel.config.ts"),
      outPath: join(newRoot, "different-output"),
    });

    const changed = changes.next();
    writeFileSync(join(oldRoot, "old.ziel"), "scalar Old on string;\n");
    writeFileSync(join(newRoot, "new.ziel"), "scalar New on string;\n");

    const reason = await changed;
    expect(reason).toContain("new.ziel");
    expect(reason).not.toContain("old.ziel");
  });

  it("waits for an in-flight callback and leaves no scheduled callback on close", async () => {
    const root = makeTempDir();
    const input = join(root, "schema.ziel");
    writeFileSync(input, "scalar Id on string;\n");
    let signalStarted!: () => void;
    let releaseCallback!: () => void;
    const started = new Promise<void>((resolveStarted) => {
      signalStarted = resolveStarted;
    });
    const released = new Promise<void>((resolveReleased) => {
      releaseCallback = resolveReleased;
    });

    controller = await watchCodegenInputs({
      root,
      configPath: join(root, "ziel.config.ts"),
      outPath: join(root, "generated"),
      debounceMs: 10,
      onChange: async () => {
        signalStarted();
        await released;
      },
    });

    writeFileSync(input, "scalar Id on string;\nresource Page(id: Id): { id }\n");
    await started;

    let closed = false;
    const closing = controller.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);

    releaseCallback();
    await closing;
    expect(closed).toBe(true);
    controller = undefined;
  });
});
