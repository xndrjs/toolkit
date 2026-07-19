---
title: Dictionaries
description: Translation dictionary shape, YAML authoring, and serving compiled JSON from public/.
---

Each key maps locale codes to ICU strings: `key → locale → template`. Paths in `i18n.codegen.json` may use `.json`, `.yaml`, or `.yml`.

## JSON example

```json
{
  "login_button": { "en": "Login", "it": "Accedi" },
  "welcome": { "en": "Welcome {name}!", "it": "Benvenuto {name}!" },
  "dashboard_status": {
    "en": "You have {msgCount, plural, one {1 message} other {# messages}} in {chatCount, plural, one {one chat} other {# chats}}",
    "it": "Hai {msgCount, plural, one {1 messaggio} other {# messaggi}} in {chatCount, plural, one {una chat} other {# chat}}"
  }
}
```

Inside a `plural` or `selectordinal` branch, ICU `#` stands in for the numeric argument, formatted for the locale.

## YAML authoring

YAML is an optional **authoring** format for dictionaries — mainly for **multiline ICU**: several parameters on separate lines, or plural/select branches that are unreadable as a single JSON string. **YAML never reaches production:** codegen compiles it to JSON under **`{artifactsPath}/translations/`** (default `{artifactsPath}` is `codegenPath`, for example `generated/translations/billing.json`). Generated TypeScript imports that compiled JSON at runtime; validation, lazy loaders, and the `load()` path behave the same as for hand-written JSON.

YAML block scalars keep complex ICU readable in source while preserving (or intentionally folding) line breaks.

```yaml
# translations/billing.yaml
appointment_summary:
  en: |
    Due {dueDate, date, short}
    at {startTime, time, short}
  it: |
    Scade il {dueDate, date, short}
    alle {startTime, time, short}

invoice_summary:
  en: |
    You have {count, plural,
      zero {no invoices}
      one {one invoice}
      other {# invoices}
    }
```

Workflow:

1. Edit `.yaml` / `.yml` under `translations/` (or keep `.json` where it is enough).
2. Run `xndrjs-i18n-codegen`.
3. Commit the YAML source; treat `generated/translations/*.json` as build output (commit or regenerate in CI).

**Mixed namespaces** are supported — for example `default.json` plus `billing.yaml` in the same `namespaces` map.

Codegen logs compiled files: `Compiled: translations/billing.yaml → generated/translations/billing.json`.

With `"delivery": "split-by-locale"`, YAML and JSON sources compile to **per-locale** files instead (`billing.en.json`, `billing.it.json`, …). See [Delivery](/v0/infrastructure/i18n/delivery/).

## Markdown and HTML in strings

`@xndrjs/i18n` formats ICU parameters only — it does not render Markdown, HTML, or layout. Long pages (legal copy, policies, emails) usually belong in a **content template** (for example Handlebars) with localized strings inside, not in one giant i18n key.

If markup does appear in a string, unquoted `<tags>` are parsed as ICU syntax, not literal HTML — quote them (for example `'<strong>'`) or use HTML entities (`&lt;strong&gt;`).

## Serving delivery JSON from `public/`

Set `"artifactsPath": "public/i18n"` in `i18n.codegen.json` to write compiled and split JSON directly under `public/i18n/translations/` while keeping generated TypeScript under `generated/`. You can also load those files with `fetch()` at runtime, then `validateExternalKey()` + `load()` + `scope.set()`. With `delivery: "split-by-locale"`, each file is already one locale per namespace (`billing.it.json`), which maps cleanly to static hosting.
