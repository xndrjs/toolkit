import { createClient, fetchAll } from "contentful-management";

import type { Locale } from "../model/locale";
import { type FetchLocalesOptions, resolveEnvironmentId } from "./cma-params";
import { mapLocaleFromCma } from "./map-from-cma";

/**
 * Fetch all locales for a space/environment via the Content Management API.
 */
export async function fetchLocales(options: FetchLocalesOptions): Promise<Locale[]> {
  const { spaceId, accessToken, environmentId } = options;
  const envId = resolveEnvironmentId(environmentId);
  const client = createClient(
    { accessToken },
    { type: "plain", defaults: { spaceId, environmentId: envId } }
  );

  const items = await fetchAll((params) => client.locale.getMany(params), {});

  return items.map((item) => mapLocaleFromCma(item));
}
