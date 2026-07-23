export type ApplicationResourcePrimitive = string | number | boolean | null;

export type ApplicationResourceKeyObject = Record<string, ApplicationResourcePrimitive>;

export type ApplicationResourceKeyPart =
  | ApplicationResourcePrimitive
  | ApplicationResourceKeyObject;

export type ApplicationResourceKey = readonly ApplicationResourceKeyPart[];

export interface ApplicationResourceIdentifier<
  Type extends string = string,
  Key extends ApplicationResourceKey = ApplicationResourceKey,
> {
  readonly type: Type;
  readonly key: Key;

  toArray(): readonly [Type, ...Key];

  format(formatter?: ApplicationResourceKeyFormatter): string;

  equals(other: ApplicationResourceIdentifier): boolean;
}

export type ApplicationResourceKeyFormatter = (
  resource: Pick<ApplicationResourceIdentifier, "type" | "key" | "toArray">
) => string;

type IsApplicationResourceKeyPart<T> = [T] extends [never]
  ? true
  : [T] extends [ApplicationResourcePrimitive]
    ? true
    : [T] extends [readonly unknown[]]
      ? false
      : [T] extends [ApplicationResourceKeyObject]
        ? true
        : false;

type ValidateKeyParts<Parts extends readonly unknown[]> = Parts extends readonly [
  infer Head,
  ...infer Tail extends readonly unknown[],
]
  ? IsApplicationResourceKeyPart<Head> extends true
    ? ValidateKeyParts<Tail> extends true
      ? true
      : false
    : false
  : true;

export type AssertValidApplicationResourceKey<Key extends readonly unknown[]> =
  ValidateKeyParts<Key> extends true ? Key : never;
