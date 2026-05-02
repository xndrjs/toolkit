import { describe, expect, it, vi } from "vitest";

import { createInflightRegistry } from "./inflight-registry";
import { task } from "./task";

describe("task", () => {
  it("runs the effect when awaited", async () => {
    let runs = 0;
    const t = task(async () => {
      runs += 1;
      return 7;
    });
    await expect(t).resolves.toBe(7);
    expect(runs).toBe(1);
  });

  it("runs the effect again on a second await", async () => {
    let runs = 0;
    const t = task(async () => {
      runs += 1;
      return runs;
    });
    await expect(t).resolves.toBe(1);
    await expect(t).resolves.toBe(2);
    expect(runs).toBe(2);
  });

  it("chains with then and narrows the result type", async () => {
    const t = task(async () => "ok" as const);
    const mapped = t.then((s) => s.length);
    await expect(mapped).resolves.toBe(2);
  });

  it("retry repeats until success", async () => {
    let n = 0;
    const effect = vi.fn(async () => {
      n += 1;
      if (n < 3) throw new Error("fail");
      return "done";
    });

    const t = task(effect).retry(() => true);
    await expect(t).resolves.toBe("done");
    expect(effect).toHaveBeenCalledTimes(3);
  });

  it("retry stops when predicate returns false", async () => {
    const err = new Error("x");
    const effect = vi.fn(async () => {
      throw err;
    });
    const shouldRetry = vi.fn(() => false);

    const t = task(effect).retry(shouldRetry);
    await expect(t).rejects.toBe(err);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(err, 0);
  });

  it("retry passes attempt index", async () => {
    let n = 0;
    const attempts: number[] = [];
    const effect = vi.fn(async () => {
      n += 1;
      if (n < 3) throw new Error("fail");
      return n;
    });

    const t = task(effect).retry((_e, attempt) => {
      attempts.push(attempt);
      return true;
    });
    await expect(t).resolves.toBe(3);
    expect(attempts).toEqual([0, 1]);
  });

  it("retry respects options.maxAttempts", async () => {
    const err = new Error("fail");
    const effect = vi.fn(async () => {
      throw err;
    });

    const t = task(effect).retry(() => true, { maxAttempts: 2 });
    await expect(t).rejects.toBe(err);
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it("retry uses default maxAttempts of 3 when options omitted", async () => {
    const err = new Error("fail");
    const effect = vi.fn(async () => {
      throw err;
    });

    const t = task(effect).retry(() => true);
    await expect(t).rejects.toBe(err);
    expect(effect).toHaveBeenCalledTimes(3);
  });

  it("retry does not call shouldRetry when maxAttempts is 1 and the effect fails", async () => {
    const err = new Error("x");
    const effect = vi.fn(async () => {
      throw err;
    });
    const shouldRetry = vi.fn(() => true);

    const t = task(effect).retry(shouldRetry, { maxAttempts: 1 });
    await expect(t).rejects.toBe(err);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(shouldRetry).not.toHaveBeenCalled();
  });

  it("retry throws when maxAttempts is invalid", () => {
    const t = task(async () => 1);
    expect(() => t.retry(() => true, { maxAttempts: 0 })).toThrow(TypeError);
    expect(() => t.retry(() => true, { maxAttempts: -1 })).toThrow(TypeError);
    expect(() => t.retry(() => true, { maxAttempts: 1.5 })).toThrow(TypeError);
  });

  it("inflightDedup shares one in-flight run for concurrent consumers", async () => {
    let runs = 0;
    let release: (() => void) | undefined;
    const barrier = new Promise<void>((r) => {
      release = r;
    });
    const dedupKey = Symbol("shared-inflight-concurrent");

    const t = task(async () => {
      runs += 1;
      await barrier;
      return runs;
    }).inflightDedup(dedupKey);

    const p = Promise.all([t, t]);
    await Promise.resolve();
    expect(runs).toBe(1);
    release?.();
    const [ra, rb] = await p;
    expect(ra).toBe(1);
    expect(rb).toBe(1);
    expect(runs).toBe(1);
  });

  it("inflightDedup after retry shares the full retry sequence across concurrent consumers", async () => {
    let n = 0;
    const effect = vi.fn(async () => {
      n += 1;
      if (n < 3) throw new Error("fail");
      return "done";
    });
    const dedupKey = Symbol("retry-shared-sequence");

    const t = task(effect)
      .retry(() => true)
      .inflightDedup(dedupKey);
    const [a, b] = await Promise.all([t, t]);
    expect(a).toBe("done");
    expect(b).toBe("done");
    expect(effect).toHaveBeenCalledTimes(3);
  });

  it("inflightDedup clears the slot after settle so a later await runs again", async () => {
    let runs = 0;
    const dedupKey = Symbol("once-slot");
    const t = task(async () => {
      runs += 1;
      return runs;
    }).inflightDedup(dedupKey);

    await expect(t).resolves.toBe(1);
    await expect(t).resolves.toBe(2);
    expect(runs).toBe(2);
  });

  it("inflightDedup does not coalesce across different registries for the same symbol", async () => {
    const key = Symbol("isolated");
    const r1 = createInflightRegistry();
    const r2 = createInflightRegistry();
    const effect = vi.fn(async () => {
      await Promise.resolve();
      return 1;
    });

    const t1 = task(effect).inflightDedup(key, r1);
    const t2 = task(effect).inflightDedup(key, r2);
    await Promise.all([t1, t2]);
    expect(effect).toHaveBeenCalledTimes(2);
  });
});
