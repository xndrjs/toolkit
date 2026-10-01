import Link from "next/link";

import { ERROR_HANDLING_CASES } from "../../../src/orchestration/error-handling-cases";
import { isErrorHandlingCaseId } from "../../../src/orchestration/resolve-error-handling";

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function ErrorHandlingCaseLayout({ children, params }: Props) {
  const { id: rawId } = await params;
  const active = isErrorHandlingCaseId(rawId) ? rawId : ERROR_HANDLING_CASES[0]!.id;
  const caseMeta = ERROR_HANDLING_CASES.find((c) => c.id === active)!;

  return (
    <main>
      <header>
        <h1>Error-handling demo</h1>
        <p className="lead">
          One query (<code>ErrorHandlingDetail</code>), six roots — each breaks a single expand
          edge. Soft policies keep projecting; <code>throw</code> aborts resolve and is caught by
          the segment error boundary below (nav stays).
        </p>
        <CaseNav active={active} />
        <p className="lead" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          Case <strong>{caseMeta.label}</strong> (<code>{caseMeta.policy}</code> · {caseMeta.shape})
          — {caseMeta.hint}
        </p>
      </header>
      {children}
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
