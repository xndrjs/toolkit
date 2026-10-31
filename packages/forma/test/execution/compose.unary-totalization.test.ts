import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { adapter } from "@xndrjs/forma";
import { boundary } from "@xndrjs/forma";
import { compose } from "@xndrjs/forma";
import {
  createUnexpectedFailure,
  expectedError,
  isUnexpectedFailure,
  success,
  unexpected,
  type InvocationOutcome,
  type OnUnexpectedFailure,
  type UnexpectedFailureEvent,
} from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

describe("compose — unary totalization", () => {
  it("converts sync operation throw into unexpected without rejecting the caller", async () => {
    const Orders = boundary("orders");
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const boom = new Error("sync boom");
    const events: UnexpectedFailureEvent[] = [];

    const GetOrderProvider = GetOrder.provide.with(
      () =>
        function () {
          throw boom;
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      onUnexpectedFailure(event) {
        events.push(event);
      },
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome.kind).toBe("unexpected");
    if (outcome.kind !== "unexpected") {
      return;
    }
    expect(isUnexpectedFailure(outcome.failure)).toBe(true);
    expect(outcome.failure.id.length).toBeGreaterThan(0);
    expect(Object.isFrozen(outcome.failure)).toBe(true);

    expect(events).toHaveLength(1);
    expect(events[0]!.cause).toBe(boom);
    expect(events[0]!.failure).toBe(outcome.failure);
    expect(events[0]!.intent).toEqual(["orders", "get"]);
    expect(events[0]!.origin).toEqual({ kind: "boundary", id: "orders" });
    expect(events[0]!.phase).toBe("invoke");
    expect(events[0]!).not.toHaveProperty("input");
    expect(events[0]!).not.toHaveProperty("params");

    await ctx.dispose();
    await root.dispose();
  });

  it("converts operation Promise rejection into unexpected", async () => {
    const Orders = boundary("orders");
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const boom = new Error("async boom");
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();

    const GetOrderProvider = GetOrder.provide.with(
      () =>
        async function () {
          throw boom;
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome).toMatchObject({ kind: "unexpected" });
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    expect(onUnexpectedFailure.mock.calls[0]![0]!.cause).toBe(boom);
    expect(onUnexpectedFailure.mock.calls[0]![0]!.phase).toBe("invoke");

    await ctx.dispose();
    await root.dispose();
  });

  it("converts sync and async factory failures into unexpected on the materializing invocation", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const syncBoom = new Error("factory sync");
    const asyncBoom = new Error("factory async");
    const events: UnexpectedFailureEvent[] = [];

    const SyncFail = Ping.provide.with(() => {
      throw syncBoom;
    });
    const AsyncFail = Ping.provide.with(async () => {
      throw asyncBoom;
    });

    const syncRoot = compose({
      entryBoundaries: [Health],
      surface: { ping: SyncFail },
      onUnexpectedFailure: (e) => {
        events.push(e);
      },
    });
    const syncCtx = syncRoot.openExecutionContext();
    const syncOutcome = await syncCtx.surface.ping();
    expect(syncOutcome.kind).toBe("unexpected");
    expect(events).toHaveLength(1);
    expect(events[0]!.cause).toBe(syncBoom);
    expect(events[0]!.phase).toBe("materialize");
    expect(events[0]!.origin).toEqual({ kind: "boundary", id: "health" });
    await syncCtx.dispose();
    await syncRoot.dispose();

    events.length = 0;
    const asyncRoot = compose({
      entryBoundaries: [Health],
      surface: { ping: AsyncFail },
      onUnexpectedFailure: (e) => {
        events.push(e);
      },
    });
    const asyncCtx = asyncRoot.openExecutionContext();
    const asyncOutcome = await asyncCtx.surface.ping();
    expect(asyncOutcome.kind).toBe("unexpected");
    expect(events).toHaveLength(1);
    expect(events[0]!.cause).toBe(asyncBoom);
    expect(events[0]!.phase).toBe("materialize");
    await asyncCtx.dispose();
    await asyncRoot.dispose();
  });

  it("preserves the same failure object and id across Boundary propagation", async () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const boom = new Error("dep boom");
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();

    const FindOrderProvider = FindOrder.provide.with(
      () =>
        function () {
          throw boom;
        }
    );
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: [FindOrderProvider],
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome.kind).toBe("unexpected");
    if (outcome.kind !== "unexpected") {
      return;
    }

    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    const event = onUnexpectedFailure.mock.calls[0]![0]!;
    expect(event.failure).toBe(outcome.failure);
    expect(event.intent).toEqual(["orders", "find"]);
    expect(event.phase).toBe("invoke");

    await ctx.dispose();
    await root.dispose();
  });

  it("does not notify for an explicit Boundary unexpected failure", async () => {
    const Orders = boundary("orders");
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const failure = createUnexpectedFailure();
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();

    const GetOrderProvider = GetOrder.provide.with(
      () =>
        function () {
          return unexpected(failure);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome).toEqual({ kind: "unexpected", failure });
    expect(onUnexpectedFailure).not.toHaveBeenCalled();

    await ctx.dispose();
    await root.dispose();
  });

  it("does not notify again when an unexpected failure is only propagated", async () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const failure = createUnexpectedFailure();
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();

    const FindOrderProvider = FindOrder.provide.with(
      () =>
        function () {
          return unexpected(failure);
        }
    );
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: [FindOrderProvider],
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome).toEqual({ kind: "unexpected", failure });
    expect(onUnexpectedFailure).not.toHaveBeenCalled();

    await ctx.dispose();
    await root.dispose();
  });

  it("keeps expected Contract errors on the error branch", async () => {
    const Orders = boundary("orders");
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();

    const GetOrderProvider = GetOrder.provide.with(
      () =>
        function (id) {
          return expectedError({ kind: "not_found" as const });
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const outcome: InvocationOutcome<Order, FindError> = await ctx.surface.getOrder({
      id: "missing",
    });
    expect(outcome).toEqual({ kind: "error", error: { kind: "not_found" } });
    expect(onUnexpectedFailure).not.toHaveBeenCalled();

    // Exhaustive handling without try/catch is a type-level property of InvocationOutcome.
    expectTypeOf(outcome).toMatchTypeOf<InvocationOutcome<Order, FindError>>();
    switch (outcome.kind) {
      case "success":
      case "error":
      case "unexpected":
      case "cancelled":
        break;
      default: {
        const _exhaustive: never = outcome;
        void _exhaustive;
      }
    }

    await ctx.dispose();
    await root.dispose();
  });

  it("isolates a throwing hook without changing the outcome or recursing", async () => {
    const Orders = boundary("orders");
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    let calls = 0;

    const GetOrderProvider = GetOrder.provide.with(
      () =>
        function () {
          throw new Error("op boom");
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      onUnexpectedFailure() {
        calls += 1;
        throw new Error("hook boom");
      },
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome.kind).toBe("unexpected");
    expect(calls).toBe(1);

    await ctx.dispose();
    await root.dispose();
  });

  it("yields the same unexpected outcome when the default hook is used", async () => {
    const Orders = boundary("orders");
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const boom = new Error("default-hook boom");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const GetOrderProvider = GetOrder.provide.with(
      () =>
        function () {
          throw boom;
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome.kind).toBe("unexpected");
    expect(consoleError).toHaveBeenCalledOnce();
    const event = consoleError.mock.calls[0]![0] as UnexpectedFailureEvent;
    expect(event.cause).toBe(boom);
    if (outcome.kind === "unexpected") {
      expect(event.failure).toBe(outcome.failure);
    }

    consoleError.mockRestore();
    await ctx.dispose();
    await root.dispose();
  });

  it("maps Adapter expected errors and passes unexpected through unchanged", async () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    type PgError = { readonly code: "NO_ROW" };
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, PgError>();
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();
    const failure = createUnexpectedFailure();

    const SelectOrderProvider = SelectOrder.provide.with(
      () =>
        function (id) {
          if (id.id === "boom") {
            return unexpected(failure);
          }
          return expectedError({ code: "NO_ROW" as const });
        }
    );

    const FindOrderAdapter = adapter("orders-postgres", Orders)
      .adapt(FindOrder)
      .using({ select: SelectOrder })
      .with(
        ({ deps: { select } }) =>
          async function (id) {
            const row = await select(id);
            switch (row.kind) {
              case "success":
                return success(row.value);
              case "error":
                return expectedError({ kind: "not_found" as const });
              case "unexpected":
              case "cancelled":
                return row;
            }
          }
      );

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: [SelectOrderProvider, FindOrderAdapter],
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const mapped = await ctx.surface.getOrder({ id: "missing" });
    expect(mapped).toEqual({ kind: "error", error: { kind: "not_found" } });

    const passthrough = await ctx.surface.getOrder({ id: "boom" });
    expect(passthrough).toEqual({ kind: "unexpected", failure });
    expect(onUnexpectedFailure).not.toHaveBeenCalled();

    await ctx.dispose();
    await root.dispose();
  });

  it("totalizes Adapter mapping throws as a new unexpected with adapter origin", async () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, never>();
    const mapBoom = new Error("map boom");
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();

    const SelectOrderProvider = SelectOrder.provide.with(
      () =>
        function (id) {
          return success({ id: id.id, total: 1 });
        }
    );

    const FindOrderAdapter = adapter("orders-postgres", Orders)
      .adapt(FindOrder)
      .using({ select: SelectOrder })
      .with(
        ({ deps: { select } }) =>
          async function (id) {
            const row = await select(id);
            if (row.kind === "success") {
              throw mapBoom;
            }
            return row;
          }
      );

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: [SelectOrderProvider, FindOrderAdapter],
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome.kind).toBe("unexpected");
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    const event = onUnexpectedFailure.mock.calls[0]![0]!;
    expect(event.cause).toBe(mapBoom);
    expect(event.origin).toEqual({ kind: "adapter", id: "orders-postgres" });
    expect(event.intent).toEqual(["orders", "find"]);
    expect(event.phase).toBe("invoke");
    if (outcome.kind === "unexpected") {
      expect(event.failure).toBe(outcome.failure);
    }

    await ctx.dispose();
    await root.dispose();
  });

  it("totalizes dependency factory failure at the dependency origin", async () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const boom = new Error("find factory");
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();

    const FindOrderProvider = FindOrder.provide.with(() => {
      throw boom;
    });
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: [FindOrderProvider],
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome.kind).toBe("unexpected");
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    const event = onUnexpectedFailure.mock.calls[0]![0]!;
    expect(event.cause).toBe(boom);
    expect(event.intent).toEqual(["orders", "find"]);
    expect(event.phase).toBe("materialize");

    await ctx.dispose();
    await root.dispose();
  });
});
