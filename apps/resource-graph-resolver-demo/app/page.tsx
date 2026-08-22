import { resolveDemoPage } from "../src/infrastructure/resolve-demo-page";

export default async function HomePage() {
  const result = await resolveDemoPage();

  if (!result.ok) {
    return (
      <main>
        <h1>Resource graph resolver demo</h1>
        <p className="lead error">Resolution failed.</p>
        <pre>
          <code>{JSON.stringify(result.errors, null, 2)}</code>
        </pre>
      </main>
    );
  }

  return (
    <main>
      <h1>Resource graph resolver demo</h1>
      <p className="lead">
        Resolved {result.resolvedCount} resources. Batch rounds are logged in the dev server
        terminal.
      </p>
      <div className="split">
        <section className="panel">
          <h2>Aggregated page</h2>
          <pre>
            <code>{JSON.stringify(result.page, null, 2)}</code>
          </pre>
        </section>
        <section className="panel">
          <h2>Serialized islands</h2>
          <pre>
            <code>{JSON.stringify(result.serializedIslands, null, 2)}</code>
          </pre>
        </section>
      </div>
    </main>
  );
}
