import Link from "next/link";

const demos = [
  {
    href: "/multi",
    title: "Multi",
    description: "Split-by-locale delivery with lazy namespace loading.",
  },
  {
    href: "/areas",
    title: "Areas",
    description: "Custom delivery areas (EU / Americas) with lazy loading.",
  },
  {
    href: "/programmatic",
    title: "Programmatic",
    description: "Codegen config written from TypeScript + split-by-locale loaders.",
  },
] as const;

export default function HomePage() {
  return (
    <main>
      <h1>@xndrjs/i18n Demo</h1>
      <p className="lead">
        Integration profiles, each with server-rendered and client-rendered examples using generated
        React bindings.
      </p>
      <div className="home-grid">
        {demos.map((demo) => (
          <Link key={demo.href} href={demo.href} className="home-card">
            <strong>{demo.title}</strong>
            <span>{demo.description}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
