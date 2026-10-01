"use client";

import { jsonForDisplay } from "../src/presentation/serialize-for-display";

export default function DemoError({ error }: { error: Error & { digest?: string } }) {
  return (
    <main>
      <header>
        <h1>Resolution threw</h1>
        <p className="lead">
          A hard failure aborted resolve. Soft policies (<code>set null</code> /{" "}
          <code>set error</code>) stay on the page; <code>throw</code> lands here so the site nav
          above remains usable.
        </p>
      </header>
      <section className="panel">
        <h2>Error</h2>
        <pre>
          <code>{jsonForDisplay(error)}</code>
        </pre>
      </section>
    </main>
  );
}
