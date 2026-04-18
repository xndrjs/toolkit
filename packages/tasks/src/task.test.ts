import { describe, expect, it, vi } from "vitest";

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
});
