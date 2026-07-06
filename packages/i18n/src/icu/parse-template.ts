import { parse } from "@formatjs/icu-messageformat-parser";
import {
  extractVariableMeta,
  variableMetaToSpec,
  type VariableMetaSpec,
  type VariableSpec,
} from "./extract-variables.js";

export type ParseTemplateSuccess = {
  readonly ok: true;
  readonly args: VariableSpec;
  readonly meta: VariableMetaSpec;
};

export type ParseTemplateFailure = {
  readonly ok: false;
  readonly message: string;
};

export type ParseTemplateResult = ParseTemplateSuccess | ParseTemplateFailure;

export function parseTemplate(template: string): ParseTemplateResult {
  try {
    const ast = parse(template);
    const meta = extractVariableMeta(ast);
    return { ok: true, args: variableMetaToSpec(meta), meta };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}
