import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

/** Boundary defined with Zod — typical for a string format coming from an HTTP/OpenAPI layer. */
export const EmailPrimitive = domain.primitive(
  "Email",
  zodToValidator(z.email().transform((value) => value.toLowerCase()))
);
