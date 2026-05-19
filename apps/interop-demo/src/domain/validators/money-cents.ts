import type { Validator } from "@xndrjs/domain";

/** Wallet balance in integer cents — validated with a hand-written core `Validator`. */
export const moneyCentsValidator: Validator<number> = {
  engine: "interop-core",
  validate(input) {
    if (typeof input !== "number" || !Number.isInteger(input) || input < 0) {
      return {
        success: false,
        error: {
          engine: "interop-core",
          issues: [
            {
              code: "invalid_money",
              path: [],
              message: "Expected non-negative integer cents",
            },
          ],
        },
      };
    }
    return { success: true, data: input };
  },
};
