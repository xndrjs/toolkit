import { domain } from "@xndrjs/domain";

import { moneyCentsValidator } from "../validators/money-cents.js";

/** Scalar money uses a core validator (no schema library on this boundary). */
export const MoneyPrimitive = domain.primitive("Money", moneyCentsValidator);
