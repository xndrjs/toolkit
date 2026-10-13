import { domain } from "@xndrjs/domain";

import { MoneyPrimitive } from "../primitives/money.primitive.js";

export const Money = domain.capabilities.forPrimitiveKit(MoneyPrimitive).methods(({ create }) => ({
  add(balance, cents: number) {
    return create(balance + cents);
  },
  subtract(balance, cents: number) {
    return create(balance - cents);
  },
}));
