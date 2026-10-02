/**
 * Taxonomy source — composite identity (`kind` + `id`) within space/environment/locale.
 */
import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  taxonomyTermAri,
  type CmsTaxonomyTermsContext,
  type TaxonomyTermPayload,
  type TaxonomyTermResource,
} from "../../generated";
import { demoTaxonomyTerms, taxonomyTermLookupKey } from "../fixtures/cms-store.js";
import type { TaxonomyTermPayloadWire } from "./schemas/taxonomy-term.js";
import { parsePayload } from "../schemas/parse-payload.js";
import { mapWireToTaxonomyTermPayload } from "./mappers/index.js";
import { taxonomyTermPayloadSchema } from "./schemas/index.js";

export const TAXONOMY_TERM_SOURCE_ID = "CmsTaxonomyTerms";

/** App `load` for the generated `CmsTaxonomyTerms` datasource. */
export function loadCmsTaxonomyTerms(
  terms: ReadonlyMap<string, TaxonomyTermPayloadWire> = demoTaxonomyTerms
) {
  return async (
    batch: readonly TaxonomyTermResource[],
    _context: ResourceLoadContext<CmsTaxonomyTermsContext>
  ): Promise<readonly (TaxonomyTermPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!taxonomyTermAri.matches(resource)) {
        return undefined;
      }
      const { spaceId, environmentId, kind, id } = resource.key[0];
      const raw = terms.get(
        taxonomyTermLookupKey({
          spaceId,
          environmentId,
          kind,
          id,
        })
      );
      if (raw === undefined) return undefined;
      const wire = parsePayload(taxonomyTermPayloadSchema, raw, "TaxonomyTerm");
      return mapWireToTaxonomyTermPayload(wire);
    });
}
