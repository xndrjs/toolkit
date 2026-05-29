import { createClient, fetchAll } from "contentful-management";

import type { ContentType } from "../model/content-type";
import { type FetchContentTypesOptions, resolveEnvironmentId } from "./cma-params";
import { mapContentTypeFromCma } from "./map-from-cma";

/**
 * Fetch all content types for a space/environment via the Content Management API.
 */
export async function fetchContentTypes(options: FetchContentTypesOptions): Promise<ContentType[]> {
  const { spaceId, accessToken, environmentId } = options;
  const envId = resolveEnvironmentId(environmentId);
  const client = createClient(
    { accessToken },
    { type: "plain", defaults: { spaceId, environmentId: envId } }
  );

  const items = await fetchAll((params) => client.contentType.getMany(params), {});

  return items.map((item) => mapContentTypeFromCma(item));
}
