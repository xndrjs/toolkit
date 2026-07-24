---
"@xndrjs/i18n": patch
"@xndrjs/i18n-react": patch
---

**@xndrjs/i18n-react:** Fix `withI18n` Rules of Hooks violation when the load gate starts in `pending` (for example `I18nRoot` without hydrated `state`) and later becomes `ready`.

Previously the HOC returned `fallback` without calling the render function, so hooks inside that render (e.g. `useState`) appeared only after resolve. The Outer now always invokes `render` (with a no-op `t` while pending), then chooses between `fallback` and the rendered output.

**@xndrjs/i18n:** Coordinated alpha prerelease with `@xndrjs/i18n-react` (no functional core changes).
