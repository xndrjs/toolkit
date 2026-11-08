import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { adapter } from "@xndrjs/forma";
import { boundary } from "@xndrjs/forma";
import { compose } from "@xndrjs/forma";
import {
  cancelled,
  createCancellation,
  createUnexpectedFailure,
  expectedError,
  isUnexpectedFailure,
  success,
  unexpectedFailure,
  type InvocationOutcome,
  type OnUnexpectedFailure,
  type UnexpectedFailureEvent,
} from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly code: "not_found" };

describe("compose — unary totalization", () => {
  it("maps a dependency success through Contract-scoped out.match", async () => {
    const Orders = boundary("orders");
    const ReadTotal = Orders.intent("readTotal").contract<void, number, never>();
    const FormatTotal = Orders.intent("formatTotal").contract<void, string, never>();

    const ReadTotalProvider = ReadTotal.provide.with(
      ({ out }) =>
        () =>
          out.success(42)
    );
    const FormatTotalProvider = FormatTotal.provide
      .using({ readTotal: ReadTotal })
      .with(({ deps: { readTotal }, out }) => async () => {
        const outcome = await readTotal();
        return out.match(outcome, {
          success: async (value) => {
            await Promise.resolve();
            return out.success(`EUR ${value}`);
          },
        });
      });

    const root = compose({
      entryBoundaries: [Orders],
      surface: { formatTotal: FormatTotalProvider },
      wiring: [ReadTotalProvider],
    });

    await root.withExecutionContext(async (surface) => {
      await expect(surface.formatTotal()).resolves.toEqual({
        kind: "success",
        value: "EUR 42",
      });
    });
    await root.dispose();
  });

  it("maps every declared Expected Error code with a narrowed payload", async () => {
    const Orders = boundary("orders");
    type LookupError =
      | { readonly code: "NO_ROW" }
      | { readonly code: "TIMEOUT"; readonly retryAfterMs: number };
    type ReadError =
      | { readonly code: "not_found" }
      | { readonly code: "temporarily_unavailable"; readonly retryAfterMs: number };

    const Lookup = Orders.intent("lookup").contract<"missing" | "timeout", Order, LookupError>();
    const Read = Orders.intent("read").contract<"missing" | "timeout", Order, ReadError>();

    const LookupProvider = Lookup.provide.with(
      ({ out }) =>
        (input) =>
          input === "missing"
            ? out.expectedError({ code: "NO_ROW" })
            : out.expectedError({ code: "TIMEOUT", retryAfterMs: 250 })
    );
    const ReadProvider = Read.provide
      .using({ lookup: Lookup })
      .with(({ deps: { lookup }, out }) => async (input) => {
        const outcome = await lookup(input);
        return out.match(outcome, {
          success: (order) => out.success(order),
          expectedError: {
            NO_ROW: (error) => {
              expectTypeOf(error).toEqualTypeOf<{ readonly code: "NO_ROW" }>();
              return out.expectedError({ code: "not_found" });
            },
            TIMEOUT: (error) => {
              expectTypeOf(error).toEqualTypeOf<{
                readonly code: "TIMEOUT";
                readonly retryAfterMs: number;
              }>();
              return out.expectedError({
                code: "temporarily_unavailable",
                retryAfterMs: error.retryAfterMs,
              });
            },
          },
        });
      });

    const root = compose({
      entryBoundaries: [Orders],
      surface: { read: ReadProvider },
      wiring: [LookupProvider],
    });

    await root.withExecutionContext(async (surface) => {
      await expect(surface.read("missing")).resolves.toEqual({
        kind: "expectedError",
        error: { code: "not_found" },
      });
      await expect(surface.read("timeout")).resolves.toEqual({
        kind: "expectedError",
        error: { code: "temporarily_unavailable", retryAfterMs: 250 },
      });
    });
    await root.dispose();
  });

  it("totalizes an undeclared runtime Expected Error code at the matching Intent", async () => {
    const Orders = boundary("orders");
    type LookupError = { readonly code: "NO_ROW" };
    const Lookup = Orders.intent("lookup").contract<void, Order, LookupError>();
    const Read = Orders.intent("read").contract<void, Order, FindError>();
    const driftedError = { code: "NEW_CODE" } as unknown as LookupError;
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();

    const LookupProvider = Lookup.provide.with(
      ({ out }) =>
        () =>
          out.expectedError(driftedError)
    );
    const ReadProvider = Read.provide
      .using({ lookup: Lookup })
      .with(({ deps: { lookup }, out }) => async () => {
        const outcome = await lookup();
        return out.match(outcome, {
          success: (order) => out.success(order),
          expectedError: {
            NO_ROW: () => out.expectedError({ code: "not_found" }),
          },
        });
      });

    const root = compose({
      entryBoundaries: [Orders],
      surface: { read: ReadProvider },
      wiring: [LookupProvider],
      onUnexpectedFailure,
    });

    await root.withExecutionContext(async (surface) => {
      const outcome = await surface.read();
      expect(outcome.kind).toBe("unexpectedFailure");
      expect(onUnexpectedFailure).toHaveBeenCalledOnce();
      const event = onUnexpectedFailure.mock.calls[0]![0];
      expect(event.intent).toEqual(["orders", "read"]);
      expect(event.origin).toEqual({ kind: "boundary", id: "orders" });
      expect(event.phase).toBe("invoke");
      expect(event.cause).toBeInstanceOf(Error);
      expect((event.cause as Error).message).toContain("NEW_CODE");
      expect((event.cause as Error).cause).toBe(driftedError);
      if (outcome.kind === "unexpectedFailure") {
        expect(event.failure).toBe(outcome.failure);
      }
    });
    await root.dispose();
  });

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
    expect(outcome.kind).toBe("unexpectedFailure");
    if (outcome.kind !== "unexpectedFailure") {
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
    expect(outcome).toMatchObject({ kind: "unexpectedFailure" });
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
    expect(syncOutcome.kind).toBe("unexpectedFailure");
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
    expect(asyncOutcome.kind).toBe("unexpectedFailure");
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
    expect(outcome.kind).toBe("unexpectedFailure");
    if (outcome.kind !== "unexpectedFailure") {
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
          return unexpectedFailure(failure);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome).toEqual({ kind: "unexpectedFailure", failure });
    expect(onUnexpectedFailure).not.toHaveBeenCalled();

    await ctx.dispose();
    await root.dispose();
  });

  it("awaits an Observability Boundary reporter without replacing the explicit failure", async () => {
    const Orders = boundary("orders");
    const Observability = boundary("observability");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    type DiagnosticEvent = {
      readonly failureId: string;
      readonly source: string;
    };
    const ReportUnexpectedFailure = Observability.intent("reportUnexpectedFailure").contract<
      DiagnosticEvent,
      void,
      never
    >();
    const reported: DiagnosticEvent[] = [];
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();

    const ReportUnexpectedFailureProvider = ReportUnexpectedFailure.provide.with(
      ({ out }) =>
        async function (event) {
          await Promise.resolve();
          reported.push(event);
          return out.success(undefined);
        }
    );
    const FindOrderAdapter = adapter("orders-observed", Orders)
      .adapt(FindOrder)
      .using({ reportUnexpectedFailure: ReportUnexpectedFailure })
      .with(
        ({ deps: { reportUnexpectedFailure }, out }) =>
          function () {
            return out.unexpectedFailure((failure) =>
              reportUnexpectedFailure({
                failureId: failure.id,
                source: "postgres.selectOrder",
              })
            );
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
      wiring: [FindOrderAdapter, ReportUnexpectedFailureProvider],
      onUnexpectedFailure,
    });
    const ctx = root.openExecutionContext();

    const outcome = await ctx.surface.getOrder({ id: "1" });
    expect(outcome.kind).toBe("unexpectedFailure");
    if (outcome.kind === "unexpectedFailure") {
      expect(reported).toEqual([
        {
          failureId: outcome.failure.id,
          source: "postgres.selectOrder",
        },
      ]);
    }
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
          return unexpectedFailure(failure);
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
    expect(outcome).toEqual({ kind: "unexpectedFailure", failure });
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
        function (_id) {
          return expectedError({ code: "not_found" as const });
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
    expect(outcome).toEqual({ kind: "expectedError", error: { code: "not_found" } });
    expect(onUnexpectedFailure).not.toHaveBeenCalled();

    // Exhaustive handling without try/catch is a type-level property of InvocationOutcome.
    expectTypeOf(outcome).toMatchTypeOf<InvocationOutcome<Order, FindError>>();
    switch (outcome.kind) {
      case "success":
      case "expectedError":
      case "unexpectedFailure":
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
    expect(outcome.kind).toBe("unexpectedFailure");
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
    expect(outcome.kind).toBe("unexpectedFailure");
    expect(consoleError).toHaveBeenCalledOnce();
    const event = consoleError.mock.calls[0]![0] as UnexpectedFailureEvent;
    expect(event.cause).toBe(boom);
    if (outcome.kind === "unexpectedFailure") {
      expect(event.failure).toBe(outcome.failure);
    }

    consoleError.mockRestore();
    await ctx.dispose();
    await root.dispose();
  });

  it("maps Adapter expected errors and passes unexpected/cancelled through unchanged", async () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    type PgError = { readonly code: "NO_ROW" };
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, PgError>();
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();
    const failure = createUnexpectedFailure();
    const cancellation = createCancellation();

    const SelectOrderProvider = SelectOrder.provide.with(
      () =>
        function (id) {
          if (id.id === "boom") {
            return unexpectedFailure(failure);
          }
          if (id.id === "cancel") {
            return cancelled(cancellation);
          }
          return expectedError({ code: "NO_ROW" as const });
        }
    );

    const FindOrderAdapter = adapter("orders-postgres", Orders)
      .adapt(FindOrder)
      .using({ select: SelectOrder })
      .with(
        ({ deps: { select }, out }) =>
          async function (id) {
            const row = await select(id);
            return out.match(row, {
              success: (value) => out.success(value),
              expectedError: {
                NO_ROW: () => out.expectedError({ code: "not_found" }),
              },
            });
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
    expect(mapped).toEqual({ kind: "expectedError", error: { code: "not_found" } });

    const unexpectedPassthrough = await ctx.surface.getOrder({ id: "boom" });
    expect(unexpectedPassthrough).toEqual({ kind: "unexpectedFailure", failure });

    const cancelledPassthrough = await ctx.surface.getOrder({ id: "cancel" });
    expect(cancelledPassthrough).toEqual({ kind: "cancelled", cancellation });
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
    expect(outcome.kind).toBe("unexpectedFailure");
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    const event = onUnexpectedFailure.mock.calls[0]![0]!;
    expect(event.cause).toBe(mapBoom);
    expect(event.origin).toEqual({ kind: "adapter", id: "orders-postgres" });
    expect(event.intent).toEqual(["orders", "find"]);
    expect(event.phase).toBe("invoke");
    if (outcome.kind === "unexpectedFailure") {
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
    expect(outcome.kind).toBe("unexpectedFailure");
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    const event = onUnexpectedFailure.mock.calls[0]![0]!;
    expect(event.cause).toBe(boom);
    expect(event.intent).toEqual(["orders", "find"]);
    expect(event.phase).toBe("materialize");

    await ctx.dispose();
    await root.dispose();
  });
});
