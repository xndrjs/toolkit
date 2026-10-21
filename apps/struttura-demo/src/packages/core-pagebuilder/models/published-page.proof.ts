import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

export const PublishedPageProof = domain
  .proof(
    "PublishedPage",
    z.object({
      // TODO: define proof baseline schema
    })
  )
  .refineType(
    (
      row
    ): row is typeof row & {
      /* TODO */
    } => {
      return true;
    }
  );

export type PublishedPage = ReturnType<(typeof PublishedPageProof)["assert"]>;
