import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { domain, DomainValidationError } from "./index";

/**
 * Shape kits freeze the row shallowly. Zod `z.date()` (and other class-typed fields)
 * therefore keep a live mutable instance on the trusted boundary.
 *
 * This file pins that contract so changes to freeze / patch / Zod adapters stay
 * intentional rather than accidental.
 */
describe("shape + zod date / mutable class fields", () => {
  const EventSchema = z.object({
    type: z.literal("Event").default("Event"),
    id: z.string(),
    occurredAt: z.date(),
  });

  const EventModel = domain.shape("Event", EventSchema);
  type Event = ReturnType<typeof EventModel.create>;

  const EventOps = domain.capabilities.forShapeKit(EventModel).methods(({ patch }) => ({
    reschedule(event, occurredAt: Date) {
      return patch(event, { occurredAt });
    },
    rename(event, id: string) {
      return patch(event, { id });
    },
  }));

  it("Event.occurredAt is typed as Date", () => {
    expectTypeOf<Event["occurredAt"]>().toEqualTypeOf<Date>();
  });

  it("z.date accepts Date instances and rejects ISO strings", () => {
    const when = new Date("2024-06-15T12:00:00.000Z");
    const event = EventModel.create({ id: "e-1", occurredAt: when });

    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.occurredAt.getTime()).toBe(when.getTime());
    expect(EventModel.is(event)).toBe(true);

    expect(() =>
      EventModel.create({ id: "e-2", occurredAt: "2024-06-15T12:00:00.000Z" as unknown as Date })
    ).toThrow(DomainValidationError);
  });

  it("z.coerce.date accepts ISO strings at the shape boundary", () => {
    const Coerced = domain.shape(
      "CoercedEvent",
      z.object({
        type: z.literal("CoercedEvent").default("CoercedEvent"),
        occurredAt: z.coerce.date(),
      })
    );

    const event = Coerced.create({ occurredAt: "2024-06-15T12:00:00.000Z" });
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.occurredAt.toISOString()).toBe("2024-06-15T12:00:00.000Z");
  });

  it("Object.freeze on the shape is shallow: Date fields stay mutable", () => {
    const when = new Date("2024-01-01T00:00:00.000Z");
    const event = EventModel.create({ id: "e-3", occurredAt: when });

    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.occurredAt)).toBe(false);

    event.occurredAt.setUTCFullYear(2030);
    expect(event.occurredAt.getUTCFullYear()).toBe(2030);
    // Same reference Zod returned — freeze did not clone the Date.
    expect(event.occurredAt).toBe(when);
  });

  it("patch keeps delta Date identity: z.date re-emits the assigned reference", () => {
    const event = EventModel.create({
      id: "e-4",
      occurredAt: new Date("2024-03-01T08:00:00.000Z"),
    });
    const nextWhen = new Date("2024-03-02T08:00:00.000Z");

    const next = EventOps.reschedule(event, nextWhen);

    // structuredClone runs on the old row before Object.assign(delta);
    // z.date then re-emits the delta Date by reference — no second clone.
    expect(next.occurredAt).toBe(nextWhen);
    expect(next.occurredAt).not.toBe(event.occurredAt);

    nextWhen.setUTCFullYear(1999);
    expect(next.occurredAt.getUTCFullYear()).toBe(1999);
  });

  it("patch clones untouched Date fields from the prior row via structuredClone", () => {
    const event = EventModel.create({
      id: "e-5",
      occurredAt: new Date("2024-03-01T08:00:00.000Z"),
    });

    const renamed = EventOps.rename(event, "e-5b");

    expect(renamed.occurredAt).not.toBe(event.occurredAt);
    expect(renamed.occurredAt.getTime()).toBe(event.occurredAt.getTime());

    event.occurredAt.setUTCFullYear(1980);
    expect(renamed.occurredAt.getUTCFullYear()).toBe(2024);
  });

  it("is() still recognizes instances after Date field mutation", () => {
    const event = EventModel.create({
      id: "e-6",
      occurredAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    event.occurredAt.setTime(Date.UTC(2021, 0, 1));

    expect(EventModel.is(event)).toBe(true);
    expect(event.occurredAt.toISOString()).toBe("2021-01-01T00:00:00.000Z");
  });
});
