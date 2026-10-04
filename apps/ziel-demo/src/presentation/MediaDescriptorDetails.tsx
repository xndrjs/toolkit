import type { MediaDescriptorWire } from "../infrastructure/cms/schemas/media-descriptor.js";

/** Presentational — receives an already-unwrapped media descriptor. */
export function MediaDescriptorDetails({ descriptor }: { descriptor: MediaDescriptorWire }) {
  return (
    <p style={{ margin: "0.25rem 0", color: "var(--muted)" }}>
      {descriptor.provider} · {descriptor.width}×{descriptor.height} · focal (
      {descriptor.focalPoint.x}, {descriptor.focalPoint.y})
    </p>
  );
}
