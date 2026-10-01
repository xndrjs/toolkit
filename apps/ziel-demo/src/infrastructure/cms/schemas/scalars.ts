import { z } from "zod";

/** Shared link row shape at the wire boundary (plain strings). */
export const entryLinkSchema = z.object({
  id: z.string(),
});
