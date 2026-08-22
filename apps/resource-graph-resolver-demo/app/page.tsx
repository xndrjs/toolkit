import { redirect } from "next/navigation";

import { CONTENTFUL_DEFAULT_LOCALE } from "../src/infrastructure/cms/generated/contentful.schemas";

export default function RootPage() {
  redirect(`/${CONTENTFUL_DEFAULT_LOCALE}`);
}
