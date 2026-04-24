# @xndrjs/branded

## 0.1.0

### Minor Changes

- 74d3804: removed runtime brands meta
- c9caf0c: Added instance methods; New refinement builder; Added anemic helper + types;
- 42c1f66: Added packages for tasks, orchestration, a small react adapter for interaction ports, and some basic dataloader utilities
- 51e49dd: createUseCase in orchestration for automatic mapping to anemic; refinement creation from raw input in branded;
- 07ff4e5: new internal entry point for exporting \_\_brand
- bded0a6: Introduced explicit types for kit and patch method;
- 9c3a6ed: Simplified types; added combine refinements builder;
- 9401b9d: alpha release, first implementation
- 4c0893b: Added symbols to main entry point

### Patch Changes

- 94bc645: fix: keep brand without overwriting it on update

## 0.1.0-alpha.9

### Minor Changes

- 51e49dd: createUseCase in orchestration for automatic mapping to anemic; refinement creation from raw input in branded;

## 0.1.0-alpha.8

### Minor Changes

- 74d3804: removed runtime brands meta

## Unreleased

### Breaking Changes

- **`branded.combine` removed**: chain refinements with **`branded.refineChain(firstRefinementKit).with(…).build()`** (no final `.as("…")` on the chain; combined kit has no synthetic `brand`). **`branded.refine`** stays **`.when` / `.as`** only (also when stacking on another refinement kit).
- **Runtime `__brand` removed** from shape instances and refinement `from` results. Nominal brands stay **type-level** (via `Branded` / exported `__brand` for declaration emit). **`kit.is`** for shapes now requires **method-prototype identity** + **Zod** `safeParse` on the row (plain JSON / structural clones no longer pass). Removed **`BrandState`** type export.
- **Automatic `type` discriminant removed** from **`branded.shape`**: add `type` (or any discriminant) to the Zod schema yourself, e.g. `z.literal("User").default("User")` for ergonomics.

## 0.1.0-alpha.7

### Minor Changes

- 9c3a6ed: Simplified types; added combine refinements builder;

## 0.1.0-alpha.6

### Minor Changes

- bded0a6: Introduced explicit types for kit and patch method;

## 0.1.0-alpha.5

### Minor Changes

- 4c0893b: Added symbols to main entry point

## 0.1.0-alpha.4

### Minor Changes

- 07ff4e5: new internal entry point for exporting \_\_brand

## 0.1.0-alpha.3

### Minor Changes

- c9caf0c: Added instance methods; New refinement builder; Added anemic helper + types;

## 0.1.0-alpha.2

### Minor Changes

- 42c1f66: Added packages for tasks, orchestration, a small react adapter for interaction ports, and some basic dataloader utilities

## 0.1.0-alpha.1

### Patch Changes

- fix: keep brand without overwriting it on update

## 0.1.0-alpha.0

### Minor Changes

- 9401b9d: alpha release, first implementation

## 0.1.0

### Patch Changes

- Initial published release.
