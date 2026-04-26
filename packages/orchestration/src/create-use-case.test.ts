import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { branded, __brand } from "@xndrjs/branded";

import { createUseCase } from "./create-use-case";

const WidgetSchema = z.object({
  type: z.literal("Widget").default("Widget"),
  id: z.string(),
  label: z.string(),
});

const Widget = branded.capabilities(branded.shape("Widget", WidgetSchema), () => ({
  displayName(widget) {
    return `${widget.id}: ${widget.label}`;
  },
}));

describe("createUseCase", () => {
  it("injects deps and returns synchronous plain results", async () => {
    const make = createUseCase((deps: { factor: number }) => (n: number) => n * deps.factor);
    const run = make({ factor: 3 });

    await expect(run(4)).resolves.toBe(12);
  });

  it("awaits async execute functions", async () => {
    const make = createUseCase(() => async (msg: string) => `echo:${msg}`);
    const run = make(undefined);

    await expect(run("hi")).resolves.toBe("echo:hi");
  });

  it("strips brands and methods before leaving the boundary", async () => {
    const make = createUseCase(() => (id: string) => Widget.create({ id, label: "Test" }));
    const run = make(undefined);

    const out = await run("w-1");

    expect(out).toEqual({ type: "Widget", id: "w-1", label: "Test" });
    expect(Object.keys(out)).not.toContain("displayName");
    expect(Reflect.has(out as object, __brand)).toBe(false);
  });

  it("types the handler as returning Anemic of the awaited result", async () => {
    const make = createUseCase(() => async (x: number) => Promise.resolve(String(x)));
    const run = make(undefined);

    const out = await run(7);
    expect(out).toBe("7");
    expectTypeOf(out).toEqualTypeOf<string>();
  });
});
