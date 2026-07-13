import type { ValidationIssue, ValidationResult } from "./types.js";

function issueMessage(issue: ValidationIssue): string {
  switch (issue.kind) {
    case "missing_key":
      return `Missing required key at ${issue.path.join(".")}`;
    case "unknown_key":
      return `Unknown key at ${issue.path.join(".")}`;
    case "invalid_input":
    case "invalid_locale_value":
    case "icu_syntax_error":
    case "locale_args_mismatch":
    case "variable_mismatch":
    case "variable_type_mismatch":
      return issue.message;
  }
}

export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues
    .map((issue) => {
      if ("path" in issue && issue.path.length > 0) {
        return `[${issue.path.join(".")}] ${issue.kind}: ${issueMessage(issue)}`;
      }
      return `${issue.kind}: ${issueMessage(issue)}`;
    })
    .join("\n");
}

export class DictionaryValidationError extends Error {
  constructor(public readonly issues: readonly ValidationIssue[]) {
    super(formatIssues(issues));
    this.name = "DictionaryValidationError";
  }
}

export function assertValidDictionary<T>(
  result: ValidationResult<T>
): asserts result is { ok: true; data: T } {
  if (!result.ok) {
    throw new DictionaryValidationError(result.issues);
  }
}
