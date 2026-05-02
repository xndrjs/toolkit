# @xndrjs/domain-zod

## 0.2.0

### Minor Changes

- cd4ef3a: xndrjs domain stack and tasks: modeling, schema bridges, resilient async

### Patch Changes

- Updated dependencies [cd4ef3a]
  - @xndrjs/domain@0.2.0

## Unreleased

### Breaking Changes

- Removed `zodFromKit(schema, kit)`. Nested fields must delegate entirely to the kit; put parsing and transforms on the kit’s validator (for example via `zodToValidator`).

## 0.1.1-alpha.0

### Patch Changes

- fe38108: added new domain + adapters
- Updated dependencies [fe38108]
  - @xndrjs/domain@0.1.1-alpha.0
