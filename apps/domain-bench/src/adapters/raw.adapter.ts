import type { BenchmarkAdapter } from "./contract";

export type RawSchema<TOutput = unknown> = Readonly<{
  parse?: (input: unknown) => TOutput;
}>;

export const rawAdapter: BenchmarkAdapter<RawSchema> = {
  engine: "raw",
  profile: {
    strictObjectKeys: false,
    collectsAllIssues: false,
    supportsTransform: true,
    coercesInput: false,
  },
  createValidator(schema) {
    const parse = schema.parse ?? ((value: unknown) => value);
    return {
      validate(input) {
        return { success: true, data: parse(input) };
      },
    };
  },
};
