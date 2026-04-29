import { describe, expect, expectTypeOf, it } from "vitest";

import { pipe, type Unary } from "./pipe";

describe("pipe", () => {
  it("returns the value when no transforms are given", () => {
    expect(pipe(7)).toBe(7);
    expectTypeOf(pipe(7)).toEqualTypeOf<number>();
  });

  it("threads output through unary steps with inferred types", () => {
    const inc: Unary<number, number> = (n) => n + 1;
    const toStr: Unary<number, string> = (n) => String(n);

    expect(pipe(1, inc)).toBe(2);
    expectTypeOf(pipe(1, inc)).toEqualTypeOf<number>();

    expect(pipe(1, inc, toStr)).toBe("2");
    expectTypeOf(pipe(1, inc, toStr)).toEqualTypeOf<string>();
  });

  it("supports longer chains", () => {
    const a: Unary<number, number> = (n) => n * 2;
    const b: Unary<number, string> = (n) => `x${n}`;
    const c: Unary<string, string> = (s) => s.toUpperCase();
    const d: Unary<string, number> = (s) => s.length;

    expect(pipe(3, a, b, c, d)).toBe(2);
    expectTypeOf(pipe(3, a, b, c, d)).toEqualTypeOf<number>();
  });

  it("composes nested pipe", () => {
    const add1: Unary<number, number> = (n) => n + 1;
    const triple: Unary<number, number> = (n) => n * 3;
    const asLabel: Unary<number, string> = (n) => `v${n}`;

    const fromInnerNumber = pipe(pipe(2, add1), triple, asLabel);
    expect(fromInnerNumber).toBe("v9");
    expectTypeOf(fromInnerNumber).toEqualTypeOf<string>();

    const len: Unary<string, number> = (s) => s.length;
    const addTen: Unary<number, number> = (n) => n + 10;
    const double: Unary<number, number> = (n) => n * 2;

    const fromInnerString = pipe(pipe("hello", len), addTen, double);
    expect(fromInnerString).toBe(30);
    expectTypeOf(fromInnerString).toEqualTypeOf<number>();
  });
});
