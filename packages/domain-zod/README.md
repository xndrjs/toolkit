# @xndrjs/domain-zod

Zod **4.x** adapter for [@xndrjs/domain](../domain). **`fromZod(schema)`** returns a `Validator<input, output>` consumed by `primitive`, `shape`, `proof`, and (with capabilities) the rest of the domain API.

This package **re-exports the full `@xndrjs/domain` API**, so you can import everything from one place when you use Zod.

## Install

```bash
pnpm add @xndrjs/domain-zod zod@^4
```

`@xndrjs/domain` is a direct dependency of this package; you do not have to add it separately unless you want to pin its version explicitly.

## Usage

Import domain APIs and `fromZod` from this package; import `z` from `"zod"`.

### Primitive

```ts
import { fromZod, primitive } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = primitive("Email", fromZod(z.string().email()));
const email = Email.create("a@b.com");
```

### Shape

```ts
import { fromZod, shape } from "@xndrjs/domain-zod";
import { z } from "zod";

const User = shape(
  "User",
  fromZod(
    z.object({
      type: z.literal("User").default("User"),
      id: z.string(),
    })
  )
);
const user = User.create({ id: "u-1" });
```

### Proof

```ts
import { fromZod, proof } from "@xndrjs/domain-zod";
import { z } from "zod";

const Verified = proof("Verified", fromZod(z.object({ ok: z.literal(true) })));
```

## Validation errors

Zod failures become `DomainValidationError` with `failure.engine === "zod"`, `failure.issues` normalized for the domain core, and `failure.raw` holding the original `ZodError` when useful for tooling.

## License

MIT
