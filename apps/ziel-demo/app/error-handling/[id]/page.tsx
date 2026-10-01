import { notFound } from "next/navigation";

import { Scalars } from "../../../src/generated";
import { ERROR_HANDLING_CASES } from "../../../src/orchestration/error-handling-cases";
import {
  isErrorHandlingCaseId,
  resolveErrorHandling,
} from "../../../src/orchestration/resolve-error-handling";
import { jsonForDisplay } from "../../../src/presentation/serialize-for-display";

/** Re-run resolve on every navigation (in-memory fixtures; no cache). */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return ERROR_HANDLING_CASES.map((c) => ({ id: c.id }));
}

export default async function ErrorHandlingDemoPage({ params }: Props) {
  const { id: rawId } = await params;
  if (!isErrorHandlingCaseId(rawId)) {
    notFound();
  }

  const { errorHandlingDetail, contentMap, errors, context } = await resolveErrorHandling({
    labId: Scalars.EntryId(rawId),
  });

  return (
    <>
      <p className="lead">
        Lab <code>{rawId}</code> · resolved {contentMap.size} resources with{" "}
        <strong>{context.schedulingMode}</strong> scheduling
        {errors.length > 0 ? ` · ${errors.length} soft error(s)` : ""}.
      </p>

      {errors.length > 0 ? (
        <section className="panel">
          <h2>Soft errors</h2>
          <pre>
            <code>{jsonForDisplay(errors)}</code>
          </pre>
        </section>
      ) : null}

      <section className="panel">
        <h2>Projection</h2>
        <pre>
          <code>{jsonForDisplay(errorHandlingDetail)}</code>
        </pre>
      </section>
    </>
  );
}
