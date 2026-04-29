# @xndrjs/domain-zod

Zod **4.x** adapter for [@xndrjs/domain](../domain): turns a Zod schema into a `Validator<Input, Output>` used by domain shapes, primitives, and proofs.

## Install

```bash
pnpm add @xndrjs/domain @xndrjs/domain-zod zod@^4
```

## Usage

```ts
import { fromZod } from "@xndrjs/domain-zod";
import { z } from "zod";

const validator = fromZod(z.object({ id: z.string() }));
const result = validator.validate({ id: "x" });
```

## License

MIT
