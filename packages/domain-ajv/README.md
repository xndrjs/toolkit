# @xndrjs/domain-ajv

Ajv adapter for [@xndrjs/domain](../domain) with helpers for:

- JSON Schema -> `Validator` via `jsonSchemaToValidator`
- OpenAPI bundled components -> `Validator` via `openApiComponentToValidator`

This package re-exports `@xndrjs/domain` (`domain`, `compose` + types), so you can import from one place.

## Install

```bash
pnpm add @xndrjs/domain-ajv ajv ajv-formats
```

## Quickstart

```ts
import { domain, jsonSchemaToValidator } from "@xndrjs/domain-ajv";

const Email = domain.primitive(
  "Email",
  jsonSchemaToValidator<string>({
    type: "string",
    format: "email",
    minLength: 1,
  })
);
```

```ts
import { domain, openApiComponentToValidator } from "@xndrjs/domain-ajv";
import bundledOas from "./generated/openapi.bundled.json";
import type { components } from "./generated/openapi.types";

type User = components["schemas"]["User"];
const UserShape = domain.shape("User", openApiComponentToValidator<User>(bundledOas, "User"));
```

## Custom Ajv instance

Use `createAjvDomainAdapter({ instance })` when you need custom Ajv plugins/options.

## License

MIT
