/** Wraps a region with sync markers */
export function wrapSyncRegion(syncId: string, body: string): string {
  const trimmed = body.replace(/\s+$/, "");
  return `// plop-os-sync start ${syncId}\n${trimmed ? `${trimmed}\n` : ""}// plop-os-sync end ${syncId}\n`;
}
