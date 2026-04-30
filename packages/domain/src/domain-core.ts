import { capabilities } from "./capabilities";
import { primitive } from "./primitive";
import { proof } from "./proof";
import { shape } from "./shape";
import { arrayOf, objectFromFields, optional } from "./validation-compose";

/**
 * Primary runtime entry points. `pipe` and `DomainValidationError` are also root exports.
 */
export const domainCore = {
  primitive,
  shape,
  proof,
  capabilities,
};

/**
 * Validators composition namespace.
 */
export const compose = {
  array: arrayOf,
  object: objectFromFields,
  optional,
};
