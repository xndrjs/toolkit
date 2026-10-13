import type { BenchmarkScenario } from "../runner";

export const runnerSmokeScenario: BenchmarkScenario = {
  name: "runner-smoke",
  description: "Minimal deterministic scenario to validate runner behavior.",
  supportedEngines: ["raw"],
  createCase({ mode, inputSize, context }) {
    const inputs = Array.from({ length: inputSize }, (_, index) => ({
      id: index + 1,
      value: Math.round(context.rng.next() * 1000),
      valid: mode === "invalid" ? index % 10 !== 0 : true,
    }));

    return {
      schema: {
        parse(input: unknown) {
          if (
            mode === "invalid" &&
            typeof input === "object" &&
            input !== null &&
            "valid" in input &&
            (input as { valid: unknown }).valid === false
          ) {
            return null;
          }
          return input;
        },
      },
      inputs,
    };
  },
};
