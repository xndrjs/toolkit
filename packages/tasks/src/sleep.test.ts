import { describe, expect, it, vi } from "vitest";

import { sleep } from "./sleep";

describe("sleep", () => {
  it("resolves after the requested delay", async () => {
    vi.useFakeTimers();

    const done = vi.fn();
    const promise = sleep(100).then(done);

    await vi.advanceTimersByTimeAsync(99);
    expect(done).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(done).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
