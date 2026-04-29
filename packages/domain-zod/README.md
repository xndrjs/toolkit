# @xndrjs/domain-zod

Zod **4.x** adapter for [@xndrjs/domain](../domain). Use **`domainZod.fromZod(schema)`** for a `Validator<input, output>`, or **`domainZod.primitive` / `domainZod.shape`** for kits that carry `zodSchema` (e.g. with **`domainZod.field(kit)`** on parent objects).

This package **re-exports `@xndrjs/domain`** (`domainCore` + types), so you can import from one place when you use Zod.

## Install

```bash
pnpm add @xndrjs/domain-zod zod@^4
```

`@xndrjs/domain` is a direct dependency of this package; you do not have to add it separately unless you want to pin its version explicitly.

## Usage

Import **`domainZod`**, **`domainCore`**, and (when needed) **`DomainValidationError`** / **`pipe`** from this package; import `z` from `"zod"`. Core factories live on **`domainCore`**; `pipe`, errors, and patch helpers come from the root re-export of `@xndrjs/domain`.

### Primitive (Zod-backed kit)

```ts
import { domainZod } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domainZod.primitive("Email", z.string().email());
const email = Email.create("a@b.com");
```

### Core primitive + validator only

```ts
import { domainCore, domainZod } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domainCore.primitive("Email", domainZod.fromZod(z.string().email()));
```

### Shape

```ts
import { domainZod } from "@xndrjs/domain-zod";
import { z } from "zod";

const User = domainZod.shape(
  "User",
  z.object({
    type: z.literal("User").default("User"),
    id: z.string(),
  })
);
const user = User.create({ id: "u-1" });
```

### Proof

```ts
import { domainCore, domainZod } from "@xndrjs/domain-zod";
import { z } from "zod";

const Verified = domainCore.proof("Verified", domainZod.fromZod(z.object({ ok: z.literal(true) })));
```

### Capabilities

```ts
import { domainCore, domainZod } from "@xndrjs/domain-zod";
import { z } from "zod";

const UserShape = domainCore.shape(
  "User",
  domainZod.fromZod(z.object({ id: z.string(), isVerified: z.boolean() }))
);
const User = domainCore
  .capabilities<{ isVerified: boolean }>()
  .methods((patch) => ({
    verify(u) {
      return patch(u, { isVerified: true });
    },
  }))
  .attach(UserShape);
```

## Types

`ZodPrimitiveKit` and `ZodShapeKit` are exported as **types** from this package. Other domain types (`Branded`, `ShapeKit`, `Validator`, …) are re-exported from `@xndrjs/domain`.

## Validation errors

Zod failures become **`DomainValidationError`** with `failure.engine === "zod"`, `failure.issues` normalized for the domain core, and `failure.raw` holding the original `ZodError` when useful for tooling.

## License

MIT
