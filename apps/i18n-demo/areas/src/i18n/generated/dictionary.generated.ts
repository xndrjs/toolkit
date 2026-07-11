// Automatically generated code. Do not edit manually.
import defaultAmer from "../../public/translations/default.amer.json";
import defaultEu from "../../public/translations/default.eu.json";
import type { InitialSchema, MyProjectDeliveryArea, MyProjectSchema } from "./i18n-types.generated";

const defaultByArea = {
  amer: defaultAmer,
  eu: defaultEu,
} as const;

export function defaultDictionaryFor(area: MyProjectDeliveryArea): InitialSchema {
  return {
    default: defaultByArea[area],
  };
}
