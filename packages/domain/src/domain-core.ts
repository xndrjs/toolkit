import { capabilities } from "./capabilities";
import { primitive } from "./primitive";
import { proof } from "./proof";
import { shape } from "./shape";

/**
 * Primary runtime entry points. `pipe` and `DomainValidationError` are also root exports.
 */
export const domainCore = {
  capabilities,
  primitive,
  proof,
  shape,
};
