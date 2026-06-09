export function createId(...parts: string[]): string {
  return parts.map(toIdPart).join(":");
}

function toIdPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "unknown";
}
