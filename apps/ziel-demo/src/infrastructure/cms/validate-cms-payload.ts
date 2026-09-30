/**
 * Loader-boundary validation for CMS editorial payloads.
 *
 * The resolver treats `load` results as trusted. Untrusted transport data
 * (CMS JSON, API responses) must be checked here before returning.
 */
import type { EntryPayload, PagePayload } from "../../generated";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Minimal structural check for a Page document payload. */
export function validatePagePayload(raw: unknown): PagePayload {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.title !== "string") {
    throw new Error("Invalid Page payload from CMS store");
  }
  return raw as PagePayload;
}

const ENTRY_KINDS = new Set([
  "Hero",
  "Tabs",
  "Tab",
  "Product",
  "Menu",
  "Footer",
  "SiteInternalLink",
  "Page",
]);

/** Minimal structural check for a polymorphic Entry payload. */
export function validateEntryPayload(raw: unknown): EntryPayload {
  if (
    !isRecord(raw) ||
    typeof raw.kind !== "string" ||
    !ENTRY_KINDS.has(raw.kind) ||
    typeof raw.id !== "string"
  ) {
    throw new Error("Invalid Entry payload from CMS store");
  }
  return raw as EntryPayload;
}
