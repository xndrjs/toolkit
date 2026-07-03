import { parse } from "@formatjs/icu-messageformat-parser";
import { extractVariables, type VariableSpec } from "./extract-variables.js";

export type ParseTemplateSuccess = {
  readonly ok: true;
  readonly args: VariableSpec;
};

export type ParseTemplateFailure = {
  readonly ok: false;
  readonly message: string;
};

export type ParseTemplateResult = ParseTemplateSuccess | ParseTemplateFailure;

export function parseTemplate(template: string): ParseTemplateResult {
  try {
    const ast = parse(template);
    return { ok: true, args: extractVariables(ast) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}
