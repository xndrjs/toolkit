export function resolveLocale<L extends string>(
  value: string | string[] | undefined,
  allowed: readonly L[],
  fallback: L
): L {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw !== undefined && (allowed as readonly string[]).includes(raw)) {
    return raw as L;
  }
  return fallback;
}
