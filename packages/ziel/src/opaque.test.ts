import { describe, expect, expectTypeOf, it } from "vitest";
import { createOpaqueRegistry, defineOpaqueType, type Opaque, type OpaqueValueOf } from "./opaque";

describe("defineOpaqueType", () => {
  it("exposes the declared name on a frozen token", () => {
    const RichDocument = defineOpaqueType("RichDocument");

    expect(RichDocument.name).toBe("RichDocument");
    expect(Object.isFrozen(RichDocument)).toBe(true);
  });

  it("wrap and unwrap preserve Object.is identity without branding the value", () => {
    const RichDocument = defineOpaqueType("RichDocument");
    const raw = { blocks: [{ type: "paragraph" }] };

    const wrapped = RichDocument.wrap(raw);
    const unwrapped = RichDocument.unwrap(wrapped);

    expect(Object.is(wrapped, raw)).toBe(true);
    expect(Object.is(unwrapped, raw)).toBe(true);
    expect(Object.is(unwrapped, wrapped)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(raw, "name")).toBe(false);
    expect(Object.getOwnPropertySymbols(raw)).toEqual([]);
  });

  it("accepts non-object and non-JSON values unchanged", () => {
    const ExternalPayload = defineOpaqueType("ExternalPayload");
    const binary = new Uint8Array([1, 2, 3]);
    const fn = () => "ok";

    expect(Object.is(ExternalPayload.wrap(null), null)).toBe(true);
    expect(Object.is(ExternalPayload.wrap(42), 42)).toBe(true);
    expect(Object.is(ExternalPayload.wrap(binary), binary)).toBe(true);
    expect(Object.is(ExternalPayload.wrap(fn), fn)).toBe(true);
  });
});

describe("createOpaqueRegistry", () => {
  it("registers translators per token and translates values", () => {
    const RichDocument = defineOpaqueType("RichDocument");
    const MediaDescriptor = defineOpaqueType("MediaDescriptor");

    const registry = createOpaqueRegistry<string>()
      .register(RichDocument, (value) => `doc:${String(RichDocument.unwrap(value))}`)
      .register(MediaDescriptor, (value) => `media:${String(MediaDescriptor.unwrap(value))}`);

    expect(registry.has(RichDocument)).toBe(true);
    expect(registry.has(MediaDescriptor)).toBe(true);
    expect(registry.translate(RichDocument, RichDocument.wrap("body"))).toBe("doc:body");
    expect(registry.translate(MediaDescriptor, MediaDescriptor.wrap("thumb"))).toBe("media:thumb");
  });

  it("keys handlers by token identity, not by name string", () => {
    const first = defineOpaqueType("RichDocument");
    const second = defineOpaqueType("RichDocument");

    const registry = createOpaqueRegistry<number>().register(first, () => 1);

    expect(registry.has(first)).toBe(true);
    expect(registry.has(second)).toBe(false);
    expect(() => registry.translate(second, second.wrap({}))).toThrow(
      'No translator registered for opaque type "RichDocument"'
    );
  });

  it("rejects duplicate registration for the same token", () => {
    const RichDocument = defineOpaqueType("RichDocument");
    const registry = createOpaqueRegistry<string>().register(RichDocument, () => "a");

    expect(() => registry.register(RichDocument, () => "b")).toThrow(
      'Opaque type "RichDocument" is already registered'
    );
  });

  it("fails clearly when a translator is missing", () => {
    const MediaDescriptor = defineOpaqueType("MediaDescriptor");
    const registry = createOpaqueRegistry<string>();

    expect(registry.has(MediaDescriptor)).toBe(false);
    expect(() => registry.translate(MediaDescriptor, MediaDescriptor.wrap({}))).toThrow(
      'No translator registered for opaque type "MediaDescriptor"'
    );
  });
});

describe("opaque type safety", () => {
  it("keeps OpaqueValueOf nominal per token name", () => {
    const RichDocument = defineOpaqueType("RichDocument");
    const MediaDescriptor = defineOpaqueType("MediaDescriptor");

    type RichDocumentValue = OpaqueValueOf<typeof RichDocument>;
    type MediaDescriptorValue = OpaqueValueOf<typeof MediaDescriptor>;

    expectTypeOf<RichDocumentValue>().toEqualTypeOf<Opaque<"RichDocument">>();
    expectTypeOf<MediaDescriptorValue>().toEqualTypeOf<Opaque<"MediaDescriptor">>();
    expectTypeOf<RichDocumentValue>().not.toEqualTypeOf<MediaDescriptorValue>();
    expectTypeOf(MediaDescriptor.wrap({})).toEqualTypeOf<Opaque<"MediaDescriptor">>();

    const doc = RichDocument.wrap({ html: "<p/>" });
    expectTypeOf(doc).toEqualTypeOf<Opaque<"RichDocument">>();
    expectTypeOf(RichDocument.unwrap(doc)).toEqualTypeOf<unknown>();

    type Wire = { html: string };
    expectTypeOf(RichDocument.unwrap<Wire>(doc)).toEqualTypeOf<Wire>();
  });

  it("rejects mismatched token/value pairs at the type level", () => {
    const RichDocument = defineOpaqueType("RichDocument");
    const MediaDescriptor = defineOpaqueType("MediaDescriptor");
    const registry = createOpaqueRegistry<string>().register(MediaDescriptor, () => "ok");

    const doc = RichDocument.wrap({ html: "<p/>" });

    // @ts-expect-error -- RichDocument value cannot be translated with MediaDescriptor
    registry.translate(MediaDescriptor, doc);

    // @ts-expect-error -- MediaDescriptor token cannot wrap into RichDocument unwrap
    RichDocument.unwrap(MediaDescriptor.wrap({}));

    expect(registry.translate(MediaDescriptor, MediaDescriptor.wrap({}))).toBe("ok");
  });
});
