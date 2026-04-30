# @xndrjs/domain-valibot

Valibot **1.x** adapter for [@xndrjs/domain](../domain). Use **`valibotToValidator(schema)`** for a `Validator<input, output>`, and **`valibotFromKit(kit)`** to compose core kits as nested Valibot fields.

This package **re-exports `@xndrjs/domain`** (`domain`, `compose` + types), so you can import from one place when you use Valibot.

## Install

```bash
pnpm add @xndrjs/domain-valibot valibot
```

## Usage

```ts
import * as v from "valibot";
import { domain, valibotToValidator } from "@xndrjs/domain-valibot";

const Email = domain.primitive("Email", valibotToValidator(v.pipe(v.string(), v.email())));
```

```ts
import * as v from "valibot";
import { domain, valibotFromKit, valibotToValidator } from "@xndrjs/domain-valibot";

const Address = domain.shape(
  "Address",
  valibotToValidator(
    v.object({
      type: v.optional(v.literal("Address"), "Address"),
      city: v.string(),
    })
  )
);

const User = domain.shape(
  "User",
  valibotToValidator(
    v.object({
      type: v.optional(v.literal("User"), "User"),
      address: valibotFromKit(Address),
    })
  )
);
```

## License

MIT
