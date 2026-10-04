import type { RichDocumentWire } from "../infrastructure/cms/schemas/rich-document.js";

/** Presentational — receives an already-unwrapped rich document. */
export function RichDocumentBody({ doc }: { doc: RichDocumentWire }) {
  return (
    <>
      {doc.blocks.map((block, index) => (
        <p key={index} style={{ margin: "0.25rem 0" }}>
          {block.text}
        </p>
      ))}
    </>
  );
}
