---
"@xndrjs/i18n": patch
"@xndrjs/i18n-react": patch
---

Ship compiled CLIs (`dist/cli/*`) instead of `tsx` launcher shims; remove the `tsx` peer dependency from both packages.

**@xndrjs/i18n:** fix Windows codegen output paths by normalizing generated file paths to POSIX separators.

**@xndrjs/i18n-react:** add package README documenting codegen, SSR hydration, and gate/HOC usage.
