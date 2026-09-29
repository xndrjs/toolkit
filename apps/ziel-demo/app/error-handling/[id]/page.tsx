import Link from "next/link";
import { notFound } from "next/navigation";

import { Scalars } from "../../../src/generated";
import { ERROR_HANDLING_CASES } from "../../../src/infrastructure/fixtures/store";
import {
  isErrorHandlingCaseId,
  resolveErrorHandling,
} from "../../../src/orchestration/resolve-error-handling";

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

  const caseMeta = ERROR_HANDLING_CASES.find((c) => c.id === rawId)!;
  const result = await resolveErrorHandling({
    labId: Scalars.EntryId(rawId),
  });

  return (
    <main>
      <header>
        <h1>Error-handling demo</h1>
        <p className="lead">
          One query (<code>ErrorHandlingDetail</code>), six roots — each breaks a single expand
          edge. Soft policies keep projecting; <code>throw</code> aborts resolve.
        </p>
        <CaseNav active={rawId} />
        <p style={{ marginTop: "0.75rem" }}>
          <Link href="/en-US">← Page detail demo</Link>
        </p>
      </header>

      <p className="lead">
        Case <strong>{caseMeta.label}</strong> (<code>{caseMeta.policy}</code> · {caseMeta.shape}) —
        lab <code>{rawId}</code>
        {result.ok ? ` · resolved ${result.meta.resolvedCount} resources` : " · hard failure"}
      </p>
      <p className="lead">{caseMeta.hint}</p>

      <section className="panel">
        <h2>Errors</h2>
        <pre>
          <code>{JSON.stringify(result.errors, null, 2)}</code>
        </pre>
      </section>

      {result.ok ? (
        <section className="panel">
          <h2>Projection</h2>
          <pre>
            <code>{JSON.stringify(result.lab, replacer, 2)}</code>
          </pre>
        </section>
      ) : null}
    </main>
  );
}

function CaseNav({ active }: { active: string }) {
  return (
    <nav
      aria-label="Error-handling cases"
      style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 0.75rem", marginBottom: "0.5rem" }}
    >
      {ERROR_HANDLING_CASES.map((c) => (
        <Link
          key={c.id}
          href={`/error-handling/${c.id}`}
          style={{
            fontWeight: c.id === active ? 700 : 400,
            textDecoration: c.id === active ? "underline" : "none",
          }}
        >
          {c.label}
        </Link>
      ))}
    </nav>
  );
}

/** Serialize ResolutionError instances in the projection dump. */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    const withCode = value as Error & { code?: string; resourceKey?: string };
    return {
      name: value.name,
      message: value.message,
      ...(typeof withCode.code === "string" ? { code: withCode.code } : {}),
      ...(typeof withCode.resourceKey === "string" ? { resourceKey: withCode.resourceKey } : {}),
    };
  }
  return value;
}
