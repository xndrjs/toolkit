# @xndrjs/contentful-to-zod-demo

**Not published** — this app is `private` and listed in `.changeset/config.json` `ignore`, so it is excluded from Changesets versioning and from npm publish on both stable and alpha releases.

Side-by-side workshop for `@xndrjs/contentful-to-zod`: **one CMA snapshot**, **four codegen configs**, so you can diff flat vs delivery vs `locale=*` opt-in on the same content model.

## Layout

```
schema-fixtures/          # shared content types + locales
configs/                  # four defineConfig entry points
generated/                # committed outputs (re-run with pnpm codegen)
src/codegen.test.ts       # smoke checks on exports
```

## Schema highlights

Ad-hoc editorial model (`author` + `article`) with `validations.in` on:

| Field                | Type    | `in` values                    |
| -------------------- | ------- | ------------------------------ |
| `author.role`        | Symbol  | `writer`, `editor`, `guest`    |
| `article.status`     | Symbol  | `draft`, `review`, `published` |
| `article.priority`   | Integer | `1`, `2`, `3`                  |
| `article.tags` items | Symbol  | `news`, `guide`, `opinion`     |

`article.seo` uses an Object override in every config.

## Four codegen modes

| Script                         | Config                                   | `locale.mode` | `localeStar` | Output                                      |
| ------------------------------ | ---------------------------------------- | ------------- | ------------ | ------------------------------------------- |
| `codegen:cma`                  | `configs/cma.config.ts`                  | `cma`         | —            | `generated/cma.schemas.ts`                  |
| `codegen:both`                 | `configs/both.config.ts`                 | `both`        | `false`      | `generated/both.schemas.ts`                 |
| `codegen:delivery-locale-star` | `configs/delivery-locale-star.config.ts` | `delivery`    | `true`       | `generated/delivery-locale-star.schemas.ts` |
| `codegen:both-locale-star`     | `configs/both-locale-star.config.ts`     | `both`        | `true`       | `generated/both-locale-star.schemas.ts`     |

`localeStar: true` is accepted in config today; `*LocaleStar*` schema emission lands with the package follow-up. Until then, delivery/`both` outputs with `localeStar: true` match the non-star shapes for those modes.

## Commands

From the repo root (or this package):

```bash
pnpm --filter @xndrjs/contentful-to-zod-demo codegen
pnpm --filter @xndrjs/contentful-to-zod-demo test
pnpm --filter @xndrjs/contentful-to-zod-demo typecheck
```
