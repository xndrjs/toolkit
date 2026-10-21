import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

export const PageSlugPrimitive = domain.primitive("PageSlug", z.string());

export type PageSlug = ReturnType<(typeof PageSlugPrimitive)["create"]>;
