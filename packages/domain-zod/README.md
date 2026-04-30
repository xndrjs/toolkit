# @xndrjs/domain-zod

Zod **4.x** adapter for [@xndrjs/domain](../domain). Use **`zodToValidator(schema)`** for a `Validator<input, output>`, and **`zodFromKit(kit)`** to compose core kits as nested Zod fields.

Prefer this package over the deprecated [`@xndrjs/branded`](../branded) for Zod-first domain modeling. **Further validation adapters** for `@xndrjs/domain` are **on the roadmap** (several likely in the near term).

This package **re-exports `@xndrjs/domain`** (`domain`, `compose` + types), so you can import from one place when you use Zod.

## Install

```bash
pnpm add @xndrjs/domain-zod zod@^4
```

`@xndrjs/domain` is a direct dependency of this package; you do not have to add it separately unless you want to pin its version explicitly.

## Usage

Import **`domain`**, **`zodToValidator`**, and **`zodFromKit`** from this package; import `z` from `"zod"`. Modeling factories live on **`domain`**; `compose`, `pipe`, and `DomainValidationError` come from the root re-export of `@xndrjs/domain`.

### Primitive

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive("Email", zodToValidator(z.email()));
const email = Email.create("a@b.com");
```

### Shape

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const User = domain.shape(
  "User",
  zodToValidator(
    z.object({
      type: z.literal("User").default("User"),
      id: z.string(),
    })
  )
);
const user = User.create({ id: "u-1" });
```

### Nested composition from existing kits

```ts
import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Address = domain.shape(
  "Address",
  zodToValidator(z.object({ type: z.literal("Address").default("Address"), city: z.string() }))
);

const User = domain.shape(
  "User",
  zodToValidator(
    z.object({
      type: z.literal("User").default("User"),
      address: zodFromKit(Address),
    })
  )
);
```

### Proof

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Verified = domain.proof("Verified", zodToValidator(z.object({ ok: z.literal(true) })));
```

### Capabilities

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const UserShape = domain.shape(
  "User",
  zodToValidator(z.object({ id: z.string(), isVerified: z.boolean() }))
);
const User = domain
  .capabilities<{ isVerified: boolean }>()
  .methods((patch) => ({
    verify(u) {
      return patch(u, { isVerified: true });
    },
  }))
  .attach(UserShape);
```

## Validation errors

Zod failures become **`DomainValidationError`** with `failure.engine === "zod"`, `failure.issues` normalized for the domain core, and `failure.raw` holding the original `ZodError` when useful for tooling.

## License

MIT
