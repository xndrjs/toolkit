import {
  applicationResourceKeySchema,
  safeParse,
  type KeySchemaIssue,
  type KeySchemaParseResult,
} from "./key-schema";
import type { ApplicationResourceKey } from "./types";

/** JSON string literal type prefix, then `:`, then JSON key payload. */
const TYPE_KEY_PATTERN = /^("(?:\\.|[^"\\])*"):(.+)$/;

export type StableStringifyResource = {
  readonly type: string;
  readonly key: ApplicationResourceKey;
};

/** Parses the canonical stable identity string with structured validation issues. */
export function safeParseStableStringifyResource(
  formatted: string
): KeySchemaParseResult<StableStringifyResource> {
  const match = formatted.match(TYPE_KEY_PATTERN);
  if (!match) {
    return {
      success: false,
      issues: [{ path: [], message: "Invalid ARI wire format" }],
    };
  }

  let type: unknown;
  let keyParsed: unknown;
  try {
    type = JSON.parse(match[1]!);
  } catch {
    return {
      success: false,
      issues: [{ path: ["type"], message: "Invalid JSON in ARI type segment" }],
    };
  }

  if (typeof type !== "string") {
    return {
      success: false,
      issues: [{ path: ["type"], message: "Expected string" }],
    };
  }

  try {
    keyParsed = JSON.parse(match[2]!);
  } catch {
    return {
      success: false,
      issues: [{ path: [], message: "Invalid JSON in ARI key segment" }],
    };
  }

  const keyResult = safeParse(applicationResourceKeySchema, keyParsed);
  if (!keyResult.success) {
    return keyResult as KeySchemaParseResult<StableStringifyResource>;
  }

  return {
    success: true,
    value: { type, key: keyResult.value as ApplicationResourceKey },
  };
}

/** Parses the canonical stable identity string produced by {@link stableStringifyResource}. */
export function parseStableStringifyResource(formatted: string): StableStringifyResource | null {
  const parsed = safeParseStableStringifyResource(formatted);
  return parsed.success ? parsed.value : null;
}

export function formatKeySchemaIssues(issues: readonly KeySchemaIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
