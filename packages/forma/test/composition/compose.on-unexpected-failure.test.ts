import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  boundary,
  compose,
  createUnexpectedFailure,
  type OnUnexpectedFailure,
  type UnexpectedFailureEvent,
} from "@xndrjs/forma";
import { success } from "@xndrjs/forma";
import { compileComposition } from "../../src/composition/compile-composition.js";
import {
  defaultOnUnexpectedFailure,
  notifyUnexpectedFailure,
  resolveOnUnexpectedFailure,
} from "../../src/composition/notify-unexpected-failure.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

function sampleEvent(overrides: Partial<UnexpectedFailureEvent> = {}): UnexpectedFailureEvent {
  const failure = overrides.failure ?? createUnexpectedFailure();
  return Object.freeze({
    cause: new Error("boom"),
    intent: ["orders", "find"] as const,
    origin: { kind: "boundary", id: "orders" } as const,
    phase: "invoke" as const,
    ...overrides,
    failure,
  });
}

describe("compose — onUnexpectedFailure", () => {
  it("defaults to console.error when the option is omitted", () => {
    expect(resolveOnUnexpectedFailure(undefined)).toBe(defaultOnUnexpectedFailure);
    expect(defaultOnUnexpectedFailure).toBe(console.error);

    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const FindOrderProvider = FindOrder.provide.with(
      (_ctx) =>
        function (id) {
          return success({ id: id.id, total: 1 });
        }
    );

    const compiled = compileComposition({
      entryBoundaries: [Orders],
      surface: { findOrder: FindOrderProvider },
    });
    expect(compiled.onUnexpectedFailure).toBe(console.error);
  });

  it("preserves a custom hook through compile into the composition root", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const FindOrderProvider = FindOrder.provide.with(
      (_ctx) =>
        function (id) {
          return success({ id: id.id, total: 1 });
        }
    );

    const onUnexpectedFailure: OnUnexpectedFailure = vi.fn();
    const compiled = compileComposition({
      entryBoundaries: [Orders],
      surface: { findOrder: FindOrderProvider },
      onUnexpectedFailure,
    });
    expect(compiled.onUnexpectedFailure).toBe(onUnexpectedFailure);

    // compose must accept the option without throwing (plumbing into owned state).
    const root = compose({
      entryBoundaries: [Orders],
      surface: { findOrder: FindOrderProvider },
      onUnexpectedFailure,
    });
    expect(root.describePlan().entryBoundaries).toEqual(["orders"]);
  });

  it("notifyUnexpectedFailure delivers the event synchronously and isolates hook throws", () => {
    const event = sampleEvent();
    const seen: UnexpectedFailureEvent[] = [];

    notifyUnexpectedFailure((e) => {
      seen.push(e);
    }, event);
    expect(seen).toEqual([event]);

    expect(() =>
      notifyUnexpectedFailure(() => {
        throw new Error("hook boom");
      }, event)
    ).not.toThrow();

    // A throwing hook must not re-enter notify (no recursion / second delivery).
    let calls = 0;
    notifyUnexpectedFailure(() => {
      calls += 1;
      if (calls === 1) {
        throw new Error("first throw");
      }
    }, event);
    expect(calls).toBe(1);
  });

  it("does not await async hook work (best-effort sync)", async () => {
    let settled = false;
    const event = sampleEvent();

    notifyUnexpectedFailure(() => {
      void Promise.resolve().then(() => {
        settled = true;
      });
    }, event);

    expect(settled).toBe(false);
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it("types UnexpectedFailureEvent without Input or Params fields", () => {
    expectTypeOf<UnexpectedFailureEvent>().toHaveProperty("failure");
    expectTypeOf<UnexpectedFailureEvent>().toHaveProperty("cause");
    expectTypeOf<UnexpectedFailureEvent>().toHaveProperty("intent");
    expectTypeOf<UnexpectedFailureEvent>().toHaveProperty("origin");
    expectTypeOf<UnexpectedFailureEvent>().toHaveProperty("phase");
    expectTypeOf<UnexpectedFailureEvent>().not.toHaveProperty("input");
    expectTypeOf<UnexpectedFailureEvent>().not.toHaveProperty("params");
  });
});
