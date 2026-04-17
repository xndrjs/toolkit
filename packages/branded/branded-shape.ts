import { z } from "zod";
import { __brand } from "./private-constants";
import { BrandedValidationError } from "./errors";
import { BrandedShape, BrandState, Mutable, UpdateInput } from "./types";

export function defineBrandedShape<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Schema extends z.ZodObject<any>,
  Type extends string,
>(type: Type, schema: Schema) {
  type Props = z.input<Schema>;
  const shapeBrandState = Object.freeze({ [type]: true });

  function create(input: Props): BrandedShape<Type, Props> {
    const parsedResult = schema.safeParse(input);
    if (!parsedResult.success) {
      throw new BrandedValidationError(
        `Invalid input for shape "${type}" during create`,
        parsedResult.error
      );
    }
    const parsed = parsedResult.data;
    return Object.freeze({
      ...parsed,
      type,
      [__brand]: shapeBrandState,
    }) as BrandedShape<Type, Props>;
  }

  function payloadForSchemaParse(
    draft: Mutable<BrandedShape<Type, Props>>
  ): Record<string, unknown> {
    const copy = { ...draft } as Record<string | typeof __brand, unknown>;
    delete copy.type;
    Reflect.deleteProperty(copy, __brand);
    return copy;
  }

  function update(
    entity: BrandedShape<Type, Props>,
    patchOrUpdater: UpdateInput<Props>
  ): BrandedShape<Type, Props> {
    const draft = { ...entity } as Mutable<BrandedShape<Type, Props>>;

    if (typeof patchOrUpdater === "function") {
      patchOrUpdater(draft as unknown as Mutable<Props>);
    } else {
      Object.assign(draft, patchOrUpdater);
    }

    const validatedResult = schema.safeParse(payloadForSchemaParse(draft));
    if (!validatedResult.success) {
      throw new BrandedValidationError(
        `Invalid input for shape "${type}" during update`,
        validatedResult.error
      );
    }
    const validated = validatedResult.data;

    return Object.freeze({
      ...validated,
      type,
      [__brand]: shapeBrandState,
    }) as BrandedShape<Type, Props>;
  }

  function is(value: unknown): value is BrandedShape<Type, Props> {
    const brandState = (value as Partial<Record<typeof __brand, unknown>>)[__brand];
    return (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      (value as { type?: unknown }).type === type &&
      __brand in value &&
      typeof brandState === "object" &&
      brandState !== null &&
      (brandState as BrandState)[type] === true
    );
  }

  return [
    {
      create,
      is,
      schema,
      type,
    },
    update,
  ] as const;
}
