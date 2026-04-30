# oas-core-validator-demo

Minimal example that shows:

1. OpenAPI 3.1 multi-file bundle (`$ref` resolution)
2. Type generation from OAS (`openapi-typescript`)
3. Runtime validation via Ajv mapped to `@xndrjs/domain` core `Validator`

## Run

```bash
pnpm --filter @xndrjs/oas-core-validator-demo run demo
```

## Files

- `openapi/openapi.yaml`: OAS entrypoint
- `openapi/schemas/*.yaml`: multi-file component schemas
- `scripts/codegen.ts`: bundles OAS and generates TS types into `src/generated/`
- `@xndrjs/domain-ajv`: reusable Ajv -> `Validator` adapter package
- `src/validate.ts`: uses `domain.shape` + `domain.proof` through `@xndrjs/domain-ajv`
