"use client";

import { jsonForDisplay } from "../../../src/presentation/serialize-for-display";

/**
 * Segment boundary for ErrorLab hard failures (`on failure throw`).
 * Layout (case nav + hint) stays mounted; only the page slot is replaced.
 */
export default function ErrorHandlingThrowBoundary({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <>
      <p className="lead">
        Expected hard failure: policy <code>throw</code> aborted resolve. Soft cases on this nav
        keep projecting; this panel is the thrown error.
      </p>
      <section className="panel">
        <h2>Thrown error</h2>
        <pre>
          <code>{jsonForDisplay(error)}</code>
        </pre>
      </section>
    </>
  );
}
