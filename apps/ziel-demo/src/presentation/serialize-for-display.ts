/**
 * JSON display helpers for demo pages.
 * `Error` instances (e.g. ResolutionError) do not serialize usefully via JSON.stringify.
 */

/** Replacer that turns Error instances into plain objects for JSON dumps. */
export function errorJsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    const withExtra = value as Error & { code?: string | number; resourceKey?: string };
    return {
      name: value.name,
      message: value.message,
      ...(withExtra.code !== undefined ? { code: String(withExtra.code) } : {}),
      ...(typeof withExtra.resourceKey === "string" ? { resourceKey: withExtra.resourceKey } : {}),
    };
  }
  return value;
}

/** Pretty-print a value for `<pre>` panels, including Error / ResolutionError. */
export function jsonForDisplay(value: unknown): string {
  return JSON.stringify(value, errorJsonReplacer, 2);
}
