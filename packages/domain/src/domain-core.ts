import { capabilities } from "./capabilities";
import { primitive } from "./primitive";
import { proof } from "./proof";
import { shape } from "./shape";

/**
 * Primary runtime entry points. Other helpers (`pipe`, `DomainValidationError`, `getShapePatchImpl`, internal symbols) are root exports.
 */
export const domainCore = {
  capabilities,
  primitive,
  proof,
  shape,
};
