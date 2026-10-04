/**
 * Composition-root opaque unwrap registry.
 * Loaders already validated + wrapped; here we only unwrap for trusted UI props.
 */
import { createOpaqueRegistry } from "@xndrjs/ziel";

import {
  MediaDescriptor,
  RichDocument,
  type MediaDescriptor as MediaDescriptorValue,
  type RichDocument as RichDocumentValue,
} from "../generated";
import type { MediaDescriptorWire } from "../infrastructure/cms/schemas/media-descriptor.js";
import type { RichDocumentWire } from "../infrastructure/cms/schemas/rich-document.js";

/** Token → unwrap (no parse, no render). Distinct from generated `ContentRegistry`. */
export const opaqueUnwrap = createOpaqueRegistry<unknown>()
  .register(RichDocument, (value) => RichDocument.unwrap(value))
  .register(MediaDescriptor, (value) => MediaDescriptor.unwrap(value));

/** App trust: wire shape was validated at the loader boundary. */
export function unwrapRichDocument(value: RichDocumentValue): RichDocumentWire {
  return opaqueUnwrap.translate(RichDocument, value) as RichDocumentWire;
}

/** App trust: wire shape was validated at the loader boundary. */
export function unwrapMediaDescriptor(value: MediaDescriptorValue): MediaDescriptorWire {
  return opaqueUnwrap.translate(MediaDescriptor, value) as MediaDescriptorWire;
}
