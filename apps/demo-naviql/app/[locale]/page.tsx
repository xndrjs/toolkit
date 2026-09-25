type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LocaleDemoPage({ params }: Props) {
  const { locale } = await params;

  return (
    <main>
      <h1>NaviQL demo</h1>
      <p className="lead">Locale: {locale}. Page detail resolve wiring comes next.</p>
    </main>
  );
}
