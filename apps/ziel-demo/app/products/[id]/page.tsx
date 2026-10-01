import { notFound } from "next/navigation";

import { DEMO_PRODUCT_ID } from "../../../src/infrastructure/fixtures/commerce-store";
import {
  parseDemoProductIdParam,
  resolveProduct,
} from "../../../src/orchestration/resolve-product";
import { jsonForDisplay } from "../../../src/presentation/serialize-for-display";

/** Re-run resolve on every navigation (in-memory fixtures; no cache). */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return [{ id: DEMO_PRODUCT_ID }];
}

export default async function ProductDemoPage({ params }: Props) {
  const { id: rawId } = await params;
  const productId = parseDemoProductIdParam(rawId);
  if (!productId) {
    notFound();
  }

  const { productDetail, contentMap, errors, context } = await resolveProduct({ productId });

  return (
    <main>
      <header>
        <h1>Product detail demo</h1>
        <p className="lead">
          Non-CMS vertical (<code>ProductDetail</code>) — catalog + pricing + inventory + media.
        </p>
      </header>

      <p className="lead">
        Product <code>{context.productId}</code> · market <strong>{context.market}</strong> · locale{" "}
        <strong>{context.locale}</strong> · resolved {contentMap.size} resources with{" "}
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
          <code>{jsonForDisplay(productDetail)}</code>
        </pre>
      </section>
    </main>
  );
}
