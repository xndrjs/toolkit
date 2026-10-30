import { describe, expect, it } from "vitest";
import { createExecutionLifecycle } from "../../src/execution/execution-lifecycle.js";

describe("execution lifecycle", () => {
  it("enter throws once dispose has started (rejects new work while draining)", async () => {
    const life = createExecutionLifecycle({
      notOpenMessage: "Execution context is disposed",
    });

    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    life.enter();
    const draining = life.dispose(async () => {
      await hold;
    });

    expect(() => life.enter()).toThrow(/disposed/i);
    expect(life.signal.aborted).toBe(true);

    life.leave();
    release();
    await expect(draining).resolves.toBeUndefined();
  });

  it("dispose waits for accepted leases before afterDrain", async () => {
    const life = createExecutionLifecycle({
      notOpenMessage: "Execution context is disposed",
    });

    const order: string[] = [];
    life.enter();

    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    const disposing = life.dispose(async () => {
      order.push("afterDrain");
      await hold;
    });

    expect(order).toEqual([]);
    life.leave();
    await Promise.resolve();
    expect(order).toEqual(["afterDrain"]);

    release();
    await disposing;
  });

  it("concurrent dispose callers share one promise", async () => {
    const life = createExecutionLifecycle({
      notOpenMessage: "Execution context is disposed",
    });

    const first = life.dispose(async () => undefined);
    const second = life.dispose(async () => undefined);
    expect(second).toBe(first);
    await first;
  });
});
