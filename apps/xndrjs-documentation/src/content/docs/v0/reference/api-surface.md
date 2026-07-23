---
title: API surface
description: Compact reference for the main xndrjs APIs.
---

This page is a compact map of the APIs you will use most often.

## @xndrjs/domain

```ts
import { DomainValidationError, compose, domain, pipe } from "@xndrjs/domain";
```

### domain

```ts
domain.primitive(type, validator); // scalar Input/Output only
domain.shape(type, validator);
domain.proof(brand, validator);
domain.capabilities
  .forShape<Contract>()
  .methods(({ patch, create, safeCreate, is }) => methods)
  .attach(shapeKit); // returns capability kit (custom methods only)
domain.capabilities
  .forPrimitive<Contract>()
  .methods(({ create, safeCreate, is }) => methods)
  .attach(primitiveKit);
```

### compose

```ts
compose.optional(validator);
compose.object(fields);
compose.array(validator);
```

### pipe

```ts
pipe(value, fn1, fn2, fn3);
```

### Types and Errors

Common exported types include:

- `Validator<Input, Output>`
- `ValidationResult<T>`
- `ValidationFailure`
- `ValidationIssue`
- `PrimitiveKit`, `Scalar`
- `ShapeKit`
- `ShapeCapabilitiesBuilder`, `PrimitiveCapabilitiesBuilder`
- `ShapeCapabilityFactoryContext`, `PrimitiveCapabilityFactoryContext`
- `ShapeCapabilityKit`, `PrimitiveCapabilityKit`
- `KitInstance`
- `ProofKit`
- `ProofValue`

`DomainValidationError` is thrown by creation and assertion APIs on validation failure.

## @xndrjs/domain-zod

```ts
import { domain, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
```

- `zodToValidator(schema)`: wraps a Zod 4 schema as a domain validator.
- `zodFromKit(kit)`: validates through a primitive or shape kit, then materializes with `create`.

## @xndrjs/domain-valibot

```ts
import { domain, valibotFromKit, valibotToValidator } from "@xndrjs/domain-valibot";
```

- `valibotToValidator(schema)`: wraps a Valibot schema as a domain validator.
- `valibotFromKit(kit)`: uses a primitive or shape kit as a Valibot field.

## @xndrjs/domain-ajv

```ts
import {
  createAjvDomainAdapter,
  domain,
  jsonSchemaToValidator,
  openApiComponentToValidator,
} from "@xndrjs/domain-ajv";
```

- `jsonSchemaToValidator(schema)`: compiles JSON Schema into a domain validator.
- `openApiComponentToValidator(bundle, componentName)`: compiles an OpenAPI component schema.
- `createAjvDomainAdapter(options?)`: creates an adapter with custom AJV options.

## @xndrjs/application-resources

```ts
import { ari } from "@xndrjs/application-resources";
```

```ts
export const taskPermissionsResource = (params: { taskId: string; userId?: string }) =>
  ari("task-permissions", [
    {
      taskId: params.taskId,
      userId: params.userId ?? null,
    },
  ] as const);

const resource = taskPermissionsResource({
  taskId: "task-123",
  userId: "user-456",
});

resource.type; // "task-permissions"
resource.toArray(); // ["task-permissions", { taskId: "task-123", userId: "user-456" }]
resource.format(); // stable string
resource.equals(other);
```

Use in the application layer for resource factories and `ResourceInvalidator` ports. Adapters call `resource.toArray()` to map to cache keys. See [Application resources](/v0/application/application-resources/).

## @xndrjs/tasks

```ts
import { sleep, task } from "@xndrjs/tasks";
```

```ts
const job = task(async () => fetch("/api/users"))
  .retry(
    async (error, attempt) => {
      await sleep(200 * 2 ** attempt);
      return shouldRetry(error);
    },
    { maxAttempts: 5 }
  )
  .inflightDedup(symbolKey);

await job; // lazy until consumed
```

Use this package in the infrastructure layer to keep async effects explicit.

## @xndrjs/contentful-to-zod

```ts
import {
  defineConfig,
  fetchContentTypes,
  fetchLocales,
  generateZodSchemas,
} from "@xndrjs/contentful-to-zod";
```

- `generateZodSchemas(contentTypes, options)`: emit a self-contained Zod schemas file.
- `fetchContentTypes(cma)` / `fetchLocales(cma)`: fetch from the Contentful Management API.
- `defineConfig(...)`: typed config for CLI and programmatic codegen.

Generated output includes `*EntrySchema`, `*FieldsSchema`, `flatten*EntryFields`, and `pickLocale` (depending on `locale.mode`). See [Contentful to Zod](/v0/infrastructure/contentful-to-zod/) for CLI, pipeline, and naming.

## @xndrjs/i18n

```ts
import { IcuTranslationProviderMulti } from "@xndrjs/i18n";
import { runCodegen, regenerateNamespaces } from "@xndrjs/i18n/codegen";
import { formatIssues } from "@xndrjs/i18n/validation";
```

- `createI18n(options?)` (generated): cold start with no args / `{}`; hydrate with `{ state }` from `serialize()`; with `loaderStrategy: "fetch"` require `{ fetchImpl, state? }`.
- Handle: `load({ namespaces, locale })` / `peek(...)` / `serialize()` / `getLoadState()` — returns a locale-bound scope with typed `t()`.
- `t(namespace, key, params?)` on the locale-bound scope — compile-time key and param checking; methods are destructuring-safe.
- `namespaceLoaders` (generated): typed `import()` loaders, or `createNamespaceLoaders(fetchImpl)` when `loaderStrategy` is `"fetch"`.
- `regenerateNamespaces` — content-only delivery JSON refresh (same ICU contract); `runCodegen` for contract changes.
- `validateExternalKey` / `validateExternalNamespacePartial` (generated, optional): validate CMS payloads before writing authoring files.

See [i18n](/v0/infrastructure/i18n/) for setup, codegen config, locale fallback, and lazy loading.

## @xndrjs/i18n-react

```ts
import { I18nRootProvider, createI18nLoadGate } from "@xndrjs/i18n-react";
```

Apps normally import generated bindings (`I18nRoot`, `withI18n`, `I18n`) from `react-bindings.generated.tsx` after `xndrjs-i18n-react-codegen`. No Suspense for namespace loads — use gate / HOC fallbacks. See [React](/v0/infrastructure/i18n/react/).
