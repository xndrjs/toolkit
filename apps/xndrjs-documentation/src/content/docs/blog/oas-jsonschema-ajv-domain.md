---
title: "OAS, JSON Schema, AJV: a solid domain in a few steps with xndrjs"
description: Start from an OpenAPI contract exposed by your backend and get TypeScript types, runtime validation, and domain primitives without rewriting contracts by hand.
date: 2026-05-05
tags:
  - openapi
  - ajv
  - domain
---

In many TypeScript projects, the contract already exists.

Maybe your backend exposes an OpenAPI spec. Maybe that OpenAPI document is the shared source of truth between teams. Maybe it already contains important rules: required fields, enums, formats, `minLength`, `additionalProperties`, nested objects, accepted payloads, and rejected payloads.

The point is simple:

> if my backend exposes an OAS contract, I do not want to redefine the types by hand.

And, more importantly, I do not want to duplicate the same knowledge three times:

- once in OpenAPI
- once in TypeScript types
- once in runtime validation

That duplication feels small at the beginning, but it gets expensive as soon as the domain grows. A field is renamed, an enum gets a new value, an object becomes stricter, and suddenly you need to remember to update types, validators, mappers, and tests.

With `xndrjs`, we can use a more direct approach:

1. download or collect the OpenAPI document
2. turn it into a resolved bundle
3. use the schemas as JSON Schema inputs compiled by AJV
4. generate TypeScript types with `openapi-typescript`
5. plug everything into `domain.shape`, `domain.primitive`, and `domain.proof`

The result is a solid domain, statically typed and validated at runtime, without rewriting contracts by hand.

The [`oas-core-validator-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/oas-core-validator-demo) example app shows the full integration.

---

## The problem: static types are not enough

Imagine receiving this payload from a backend:

```ts
const payload = {
  id: "u-1",
  email: "dev@example.com",
  tier: "pro",
  isVerified: true,
  tags: ["alpha", "beta"],
};
```

In TypeScript, we could write:

```ts
type UserDTO = {
  id: string;
  email: string;
  tier: "free" | "pro";
  isVerified: boolean;
  tags?: string[];
};
```

But this immediately creates two problems.

First, we are manually copying information that already exists in the OpenAPI document.

Second, the TypeScript type does not validate anything at runtime. If a payload comes from the network, storage, a query string, a form, a message queue, or any other external boundary, it is still `unknown` to the program. We can tell the compiler that it is a `UserDTO`, but we have not proven it.

This is exactly where `xndrjs` fits:

```txt
unknown -> AJV -> xndrjs domain value
```

AJV checks the runtime contract. `xndrjs` takes the validated result and turns it into a trusted domain value.

---

## 1. Start from OpenAPI

In the demo, we use a multi-file OpenAPI 3.1 spec:

```yaml
openapi: 3.1.0
info:
  title: OAS -> Core Validator Demo
  version: 1.0.0
paths: {}
components:
  schemas:
    Tier:
      $ref: "./schemas/common.yaml#/Tier"
    User:
      $ref: "./schemas/user.yaml#/User"
    VerifiedUser:
      $ref: "./schemas/user.yaml#/VerifiedUser"
```

The `User` schema lives in a separate file:

```yaml
User:
  type: object
  required:
    - id
    - email
    - tier
    - isVerified
  properties:
    id:
      type: string
      minLength: 1
    email:
      type: string
      format: email
    tier:
      $ref: "./common.yaml#/Tier"
    isVerified:
      type: boolean
    tags:
      type: array
      items:
        type: string
        minLength: 1
      default: []
  additionalProperties: false
```

And we can also model a more specific guarantee, such as `VerifiedUser`:

```yaml
VerifiedUser:
  allOf:
    - $ref: "#/User"
    - type: object
      properties:
        isVerified:
          const: true
      required:
        - isVerified
```

This is already domain modeling: not in the sense of classes full of methods, but in the sense of explicit constraints on data.

---

## 2. Codegen: download and prepare the OAS

In a real application, the OpenAPI spec often comes from a backend endpoint, or from an artifact generated in CI.

```bash
curl https://api.example.com/openapi.json -o openapi/openapi.json
```

In the demo, the spec is local, but the conceptual step is the same: take the OAS and generate the artifacts your app needs.

The main command is:

```json
{
  "scripts": {
    "codegen": "tsx scripts/codegen.ts && pnpm exec openapi-typescript src/generated/openapi.bundled.json -o src/generated/openapi.types.ts"
  }
}
```

This script creates two files:

- `src/generated/openapi.bundled.json`
- `src/generated/openapi.types.ts`

The first one is used by AJV for runtime validation.

The second one is used by TypeScript for static type inference.

---

## 3. Bundling: from multi-file OAS to compilable schemas

Real OpenAPI specs are rarely a single flat file. They usually contain `$ref`s, shared components, separate files, and schemas reused in several places.

AJV can validate JSON Schema, but it is much more convenient to give it a resolved, stable, versionable bundle.

In the demo, we do this with `@apidevtools/swagger-parser`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oasPath = path.join(appRoot, "openapi", "openapi.yaml");
const generatedDir = path.join(appRoot, "src", "generated");
const bundledPath = path.join(generatedDir, "openapi.bundled.json");

async function main() {
  await mkdir(generatedDir, { recursive: true });

  const bundled = (await SwaggerParser.bundle(oasPath)) as Record<string, unknown>;

  await writeFile(bundledPath, `${JSON.stringify(bundled, null, 2)}\n`, "utf8");
}
```

With OpenAPI 3.1, schemas under `components.schemas` are based on JSON Schema. So the practical flow is:

```txt
multi-file OpenAPI -> bundled OpenAPI -> component schemas -> AJV
```

If you work with OpenAPI 3.0, the idea is the same, but you may need a more explicit conversion step to JSON Schema because the OAS 3.0 schema dialect does not perfectly match JSON Schema.

With OpenAPI 3.1, the flow is much more direct.

---

## 4. Generate TypeScript types with openapi-typescript

Now that we have a bundle, we generate the types:

```bash
pnpm exec openapi-typescript src/generated/openapi.bundled.json -o src/generated/openapi.types.ts
```

This produces a TypeScript file with the component map:

```ts
import type { components } from "./generated/openapi.types.js";

type Schemas = components["schemas"];

type UserDTO = Schemas["User"];
type TierDTO = Schemas["Tier"];
```

The important thing is that `UserDTO` and `TierDTO` are not handwritten types.

They are derived from OpenAPI.

So when the contract changes, we regenerate the artifacts and the compiler tells us where the application code needs to adapt.

---

## 5. Compile schemas with AJV

`@xndrjs/domain-ajv` provides the adapter between AJV and the `xndrjs` domain core.

For a plain JSON Schema, you can use `jsonSchemaToValidator`:

```ts
import { domain, jsonSchemaToValidator } from "@xndrjs/domain-ajv";

const Tier = domain.primitive(
  "Tier",
  jsonSchemaToValidator<"free" | "pro">({
    type: "string",
    enum: ["free", "pro"],
  })
);
```

Of course, you dont' want to pass the generics to `jsonSchemaToValidator` by hand.

When you start from an OpenAPI bundle, the most convenient option is write a small helper around `openApiComponentToValidator`:

```ts
import { domain, openApiComponentToValidator, type OpenApiBundle } from "@xndrjs/domain-ajv";
import type { components } from "./generated/openapi.types.js";

type Schemas = components["schemas"];

function openApiValidatorFor<K extends Extract<keyof Schemas, string>>(
  bundle: OpenApiBundle,
  name: K
) {
  return openApiComponentToValidator<Schemas[K]>(bundle, name);
}
```

This small helper connects the two worlds:

- `name` is constrained to actual OpenAPI schema names
- the validator output is inferred from `components["schemas"]`
- AJV compiles the runtime schema
- `xndrjs` receives a standard `Validator`

From there, the domain becomes very small:

```ts
const Tier = domain.primitive("Tier", openApiValidatorFor(bundle, "Tier"));
const User = domain.shape("User", openApiValidatorFor(bundle, "User"));
const VerifiedUserProof = domain.proof("VerifiedUser", openApiValidatorFor(bundle, "VerifiedUser"));
```

We now have three different concepts without duplicating the contract:

- `Tier` is a validated primitive
- `User` is a domain shape
- `VerifiedUserProof` is an additional proof that can be applied to a `User`

---

## 6. Use the domain in the app

At this point, the external payload enters the boundary as untrusted data.

```ts
const validPayload: UserDTO = {
  id: "u-1",
  email: "dev@example.com",
  tier: "pro",
  isVerified: true,
  tags: ["alpha", "beta"],
};
```

Creating a domain value means going through validation:

```ts
const user = User.create(validPayload);
```

If we also want to prove that the user is verified:

```ts
import { pipe } from "@xndrjs/domain-ajv";

const verifiedUser = pipe(User.create(validPayload), VerifiedUserProof.assert);
```

This line is small, but it says a lot:

```txt
raw payload -> User -> VerifiedUser
```

We are not just doing a type assertion. We are crossing two gates:

- the first one checks that the payload is a `User`
- the second one checks that this `User` satisfies the `VerifiedUser` proof

If a wrong payload arrives:

```ts
const invalidPayload = {
  id: "",
  email: "not-an-email",
  tier: "enterprise",
  isVerified: "yes",
  tags: [""],
};
```

`User.create(...)` fails, and `xndrjs` normalizes AJV errors into domain issues:

```ts
try {
  User.create(invalidPayload as unknown as UserDTO);
} catch (error) {
  // DomainValidationError
}
```

The benefit is that the application does not need to reason directly about AJV's internal error format. AJV remains the validation engine, while the rest of the domain speaks the `xndrjs` language.

---

## 7. The full pipeline

The final pipeline looks like this:

```txt
Backend OpenAPI
  -> download or checkout the spec
  -> resolved OAS bundle
  -> JSON Schema-compatible component schemas
  -> AJV compile
  -> xndrjs Validator
  -> domain.primitive / domain.shape / domain.proof
```

In parallel:

```txt
OpenAPI bundle
  -> openapi-typescript
  -> components["schemas"]
  -> inferred DTO types
```

So runtime and compile time both derive from the same source.

That is the important part: we are not trying to keep two manual representations in sync. We are making one source of truth feed both levels.

---

## Why this makes the domain more solid

The result is not just "validate a payload".

The result is application code where valid values have a precise place.

Before validation:

```txt
unknown
```

After validation:

```txt
User
```

After an additional proof:

```txt
VerifiedUser
```

This makes the domain more readable because every transition has a name.

And it makes the domain more robust because the normal path through the code goes through validation, not through an `as UserDTO` written to silence TypeScript.

`xndrjs` does not ask you to throw away the contracts you already have. It lets you bring them into the domain in a few steps:

- OAS as the source of truth
- JSON Schema as the validatable format
- AJV as the runtime engine
- `openapi-typescript` for types
- `xndrjs` to turn everything into domain

The full demo is here: [`apps/oas-core-validator-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/oas-core-validator-demo).

To try it:

```bash
pnpm --filter @xndrjs/oas-core-validator-demo run demo
```

And that is the point:

> in a few steps, you can take an existing OpenAPI contract and get a solid domain with `xndrjs`, without redefining types and validators by hand.
