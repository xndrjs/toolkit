import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

import { EmailPrimitive } from "../primitives/email.primitive.js";

/** Profile row uses Zod; email field still comes from the shared Zod primitive kit. */
export const ProfileShape = domain.shape(
  "Profile",
  zodToValidator(
    z.object({
      type: z.literal("Profile").default("Profile"),
      email: zodFromKit(EmailPrimitive),
      displayName: z.string().min(1),
      isVerified: z.boolean(),
      nickname: z.string().min(1).default("anonymous"),
    })
  )
);
