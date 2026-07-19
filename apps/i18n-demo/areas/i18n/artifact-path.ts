import type { DeliveryResourceId } from "@xndrjs/i18n";

/** App-owned mapping: resource id → filename under Next `public/i18n/translations`. */
export function areasArtifactFileName(id: DeliveryResourceId): string {
  if (id.area !== undefined) {
    return `${id.namespace}.${id.area}.json`;
  }
  return `${id.namespace}.${id.locale}.json`;
}
