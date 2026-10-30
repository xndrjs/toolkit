import { describe, expect, it } from "vitest";
import { boundary, compose, ok } from "@xndrjs/forma";

type Input = { readonly id: string };
type AlternateInput = { readonly id: number };
type FirstError = { readonly kind: "first" };
type SecondError = { readonly kind: "second" };

describe("compose — Contract coherence", () => {
  it("accepts exactly equivalent repeated declarations and homonymous Boundaries", async () => {
    const OrdersA = boundary("orders");
    const OrdersB = boundary("orders");
    const Required = OrdersA.intent("same").contract<Input, string, FirstError>();
    const Realized = OrdersB.intent("same").contract<Input, string, FirstError>();
    const Entry = OrdersA.intent("entry").contract<Input, string, FirstError>();

    const RealizedProvider = Realized.provide.with(() => (input) => ok(input.id));
    const EntryProvider = Entry.provide.using({ same: Required }).with(
      ({ deps: { same } }) =>
        (input) =>
          same(input)
    );

    const root = compose({
      entryBoundaries: [OrdersA],
      surface: { entry: EntryProvider },
      wiring: [RealizedProvider],
    });
    await using execution = root.openExecutionContext();

    await expect(execution.surface.entry({ id: "42" })).resolves.toEqual({
      ok: true,
      value: "42",
    });
  });

  it("type-rejects every non-equivalent Contract dimension on a resolved using edge", () => {
    const Orders = boundary("orders");
    const Entry = Orders.intent("entry").contract<void, "ok", never>();

    const RequiredInput = Orders.intent("input").contract<Input, string, FirstError>();
    const RealizedInput = Orders.intent("input").contract<AlternateInput, string, FirstError>();
    const InputConsumer = Entry.provide.using({ dep: RequiredInput }).with(() => () => ok("ok"));
    const InputProvider = RealizedInput.provide.with(() => (input) => ok(String(input.id)));

    const RequiredSuccess = Orders.intent("success").contract<Input, string, FirstError>();
    const RealizedSuccess = Orders.intent("success").contract<Input, number, FirstError>();
    const SuccessConsumer = Entry.provide
      .using({ dep: RequiredSuccess })
      .with(() => () => ok("ok"));
    const SuccessProvider = RealizedSuccess.provide.with(() => () => ok(1));

    const RequiredError = Orders.intent("error").contract<Input, string, FirstError>();
    const RealizedError = Orders.intent("error").contract<Input, string, SecondError>();
    const ErrorConsumer = Entry.provide.using({ dep: RequiredError }).with(() => () => ok("ok"));
    const ErrorProvider = RealizedError.provide.with(() => () => ok("value"));

    const RequiredMode = Orders.intent("mode").contract<Input, string, FirstError>();
    const RealizedMode = Orders.stream("mode").contract<Input, string, FirstError>();
    const ModeConsumer = Entry.provide.using({ dep: RequiredMode }).with(() => () => ok("ok"));
    const ModeProvider = RealizedMode.provide.with(
      () =>
        async function* () {
          yield ok("value");
        }
    );

    const assertTypeErrors = (): void => {
      // @ts-expect-error — incompatible Input Contract for orders.input required by orders.entry
      compose({
        entryBoundaries: [Orders],
        surface: { entry: InputConsumer },
        wiring: [InputProvider],
      });
      // @ts-expect-error — incompatible Success Contract for orders.success required by orders.entry
      compose({
        entryBoundaries: [Orders],
        surface: { entry: SuccessConsumer },
        wiring: [SuccessProvider],
      });
      // @ts-expect-error — incompatible Err Contract for orders.error required by orders.entry
      compose({
        entryBoundaries: [Orders],
        surface: { entry: ErrorConsumer },
        wiring: [ErrorProvider],
      });
      // @ts-expect-error — incompatible modality for orders.mode required by orders.entry
      compose({
        entryBoundaries: [Orders],
        surface: { entry: ModeConsumer },
        wiring: [ModeProvider],
      });
    };
    void assertTypeErrors;
  });

  it("rejects a runtime unary/stream mismatch during compose", () => {
    const Orders = boundary("orders");
    const Required = Orders.intent("same").contract<Input, string, FirstError>();
    const Realized = Orders.stream("same").contract<Input, string, FirstError>();
    const Entry = Orders.intent("entry").contract<void, "ok", never>();
    const EntryProvider = Entry.provide.using({ same: Required }).with(() => () => ok("ok"));
    const StreamProvider = Realized.provide.with(
      () =>
        async function* () {
          yield ok("value");
        }
    );

    expect(() =>
      // @ts-expect-error — the runtime check defends JavaScript and cast/widened callers
      compose({
        entryBoundaries: [Orders],
        surface: { entry: EntryProvider },
        wiring: [StreamProvider],
      })
    ).toThrow(/Incompatible Contract modality.*orders\.same/);
  });
});
