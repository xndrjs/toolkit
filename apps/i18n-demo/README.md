# @xndrjs/i18n-demo

Next.js workshop for `@xndrjs/i18n` + `@xndrjs/i18n-react`.

## Profiles

| Route           | Profile                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `/multi`        | `split-by-locale` + lazy namespaces                                            |
| `/areas`        | `custom` delivery + `loaderStrategy: "fetch"` + injectable `fetchImpl`         |
| `/programmatic` | Config from TypeScript (`buildCodegenConfig`) + `regenerateNamespaces` example |

Every profile uses the same runtime API:

```ts
const i18n = createI18n();
const { t } = await i18n.load({ namespaces: [...], locale });
```

Client trees use generated `I18nRoot` + `withI18n` / `I18n` gates (no Suspense).

## Scripts

```bash
pnpm --filter @xndrjs/i18n-demo i18n:codegen
pnpm --filter @xndrjs/i18n-demo i18n:react-codegen
pnpm --filter @xndrjs/i18n-demo dev
```
