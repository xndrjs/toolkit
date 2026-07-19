import type { ReactNode } from "react";

export function DemoPanel({
  kind,
  title,
  children,
}: {
  kind: "server" | "client";
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="demo-panel">
      <div className={`demo-panel__header demo-panel__header--${kind}`}>{title}</div>
      <div className="demo-panel__body">{children}</div>
    </section>
  );
}
