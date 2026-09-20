# @xndrjs/contentful-to-zod-demo

**Not published** — this app is `private` and listed in `.changeset/config.json` `ignore`.

Side-by-side workshop for `@xndrjs/contentful-to-zod`: **one CMA snapshot**, **four codegen configs** (different `locale.modes` sets) on the same content model.

## Layout

```
schema-fixtures/   # shared content types + locales
configs/           # four defineConfig entry points
generated/         # committed outputs (re-run with pnpm codegen)
src/codegen.test.ts
```

## Four codegen mode sets

| Script                   | `locale.modes`                         | Output                                |
| ------------------------ | -------------------------------------- | ------------------------------------- |
| `codegen:flat`           | `["flat"]`                             | `generated/flat.schemas.ts`           |
| `codegen:flat-localized` | `["flat", "localized-only"]` (default) | `generated/flat-localized.schemas.ts` |
| `codegen:localized-only` | `["localized-only"]`                   | `generated/localized-only.schemas.ts` |
| `codegen:all-modes`      | `["flat", "localized-only", "all"]`    | `generated/all-modes.schemas.ts`      |

Mode `"all"` emits `*LocaleStar*` schemas (`locale=*`) plus `flatten*LocaleStarEntryFields` when `flat` is also selected.

## Commands

```bash
pnpm --filter @xndrjs/contentful-to-zod-demo codegen
pnpm --filter @xndrjs/contentful-to-zod-demo test
pnpm --filter @xndrjs/contentful-to-zod-demo typecheck
```
