# @xndrjs/domain

Validator-agnostic semantic modeling with function-first kits:

- **primitives** for validated nominal values;
- **shapes** for immutable entity boundaries;
- **proofs** for explicit extra guarantees;
- **capabilities** for behavior attached to kits (not instances).

The package exports:

- `domain` (`primitive`, `shape`, `proof`, `capabilities`);
- `compose` (`object`, `array`, `optional`) for validator composition;
- `pipe` for proof/capability assertion chains;
- `DomainValidationError` and public types (`Validator`, `ShapeKit`, ...).

## Install

```bash
pnpm add @xndrjs/domain
```

## Quickstart (core-only)

The core needs a `Validator<input, output>`. You can write one directly or use an adapter package.

```ts
import type { Validator } from "@xndrjs/domain";
import { domain } from "@xndrjs/domain";

const nonEmptyString: Validator<unknown, string> = {
  engine: "custom",
  validate(input) {
    if (typeof input !== "string" || input.length === 0) {
      return {
        success: false,
        error: {
          engine: "custom",
          issues: [{ code: "invalid", path: [], message: "Expected non-empty string" }],
        },
      };
    }
    return { success: true, data: input };
  },
};

const Email = domain.primitive("Email", nonEmptyString);
const email = Email.create("dev@example.com");
```

## Recipes

### Nested sub-shape composition from kit

Use `compose.object` + `compose.array` + `compose.optional` to build nested validators from existing kits.

```ts
import type { Validator } from "@xndrjs/domain";
import { compose, domain } from "@xndrjs/domain";

const nonEmptyString: Validator<unknown, string> = {
  engine: "custom",
  validate(input) {
    if (typeof input !== "string" || input.length === 0) {
      return {
        success: false,
        error: {
          engine: "custom",
          issues: [{ code: "invalid", path: [], message: "Expected non-empty string" }],
        },
      };
    }
    return { success: true, data: input };
  },
};

const Address = domain.shape("Address", compose.object({ city: nonEmptyString }));
const User = domain.shape(
  "User",
  compose.object({
    id: nonEmptyString,
    address: Address,
    tags: compose.array(nonEmptyString),
    nickname: compose.optional(nonEmptyString),
  })
);
```

### Capabilities + patch re-validation

Capabilities encapsulate transitions through the internal `patch` function, preserving shape validation.

```ts
import type { Validator } from "@xndrjs/domain";
import { compose, domain } from "@xndrjs/domain";

const nonEmptyString: Validator<unknown, string> = {
  engine: "custom",
  validate(input) {
    if (typeof input !== "string" || input.length === 0) {
      return {
        success: false,
        error: {
          engine: "custom",
          issues: [{ code: "invalid", path: [], message: "Expected non-empty string" }],
        },
      };
    }
    return { success: true, data: input };
  },
};
const booleanValidator: Validator<unknown, boolean> = {
  engine: "custom",
  validate(input) {
    if (typeof input !== "boolean") {
      return {
        success: false,
        error: {
          engine: "custom",
          issues: [{ code: "invalid", path: [], message: "Expected boolean" }],
        },
      };
    }
    return { success: true, data: input };
  },
};

const UserShape = domain.shape(
  "User",
  compose.object({ displayName: nonEmptyString, isVerified: booleanValidator })
);

const User = domain
  .capabilities<{ displayName: string; isVerified: boolean }>()
  .methods((patch) => ({
    verify(user) {
      return patch(user, { isVerified: true });
    },
  }))
  .attach(UserShape);
```

### Proof + refineType + pipe

Chain proof assertions with `pipe` to get progressive guarantees.

```ts
import type { Validator } from "@xndrjs/domain";
import { domain, pipe } from "@xndrjs/domain";

const verifiedValidator: Validator<unknown, { isVerified: boolean }> = {
  engine: "custom",
  validate(input) {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof (input as { isVerified?: unknown }).isVerified !== "boolean"
    ) {
      return {
        success: false,
        error: {
          engine: "custom",
          issues: [{ code: "invalid", path: [], message: "Expected { isVerified: boolean }" }],
        },
      };
    }
    return { success: true, data: { isVerified: (input as { isVerified: boolean }).isVerified } };
  },
};

const Verified = domain
  .proof("Verified", verifiedValidator)
  .refineType<{
    isVerified: true;
  }>((row): row is typeof row & { isVerified: true } => row.isVerified === true);

const user = { isVerified: true };
const proven = pipe(user, Verified.assert);
```

## Pitfalls and design decisions

- Keep `domain` as source of truth; adapters validate boundary payloads.
- Core shape kits do not expose schema-specific extension helpers (like adapter `.extend` APIs).
- `is` checks rely on prototype/marker semantics; JSON roundtrip removes prototype and must re-enter through `create`.
- Prefer `proof.test/assert` to express explicit guarantee steps rather than implicit casts.

## See also

- Zod adapter: [`../domain-zod`](../domain-zod)
- Valibot adapter: [`../domain-valibot`](../domain-valibot)

## License

MIT
