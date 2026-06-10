import type { ReactNode } from "react";

export function ViewerFrame({
  children,
  detail,
  summary,
}: {
  children?: ReactNode;
  detail?: string;
  summary: string;
}) {
  return (
    <div className="gordio-viewer">
      <header className="gordio-header">
        <h1>Gordio Viewer</h1>
        <div className="gordio-summary">{summary}</div>
      </header>
      <main className="gordio-main">
        {detail ? <p className="gordio-message">{detail}</p> : null}
        {children ?? <div className="gordio-empty-canvas" />}
      </main>
    </div>
  );
}
