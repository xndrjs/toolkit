# @xndrjs/tasks

## 0.1.4-alpha.0

### Breaking Changes

- **Fluent API:** at most one `.retry()` and one `.inflightDedup()` per chain. `.retry` after `.inflightDedup` is removed from the type surface. New types: **`TaskAfterRetry`**, **`TaskFinal`**, **`TaskPromise`**.

## 0.1.3-alpha.0

### Breaking Changes

- **`inflightDedup`** now requires a **`symbol`** key (strings are no longer accepted). Optional second argument **`registry`**: pass **`createInflightRegistry()`** to scope in-flight coalescing; omit to use the package default store.

## 0.1.2-alpha.1

### Patch Changes

- fe38108: added new domain + adapters

## 0.1.2-alpha.0

### Patch Changes

- f9555b0: new branded model: proofs replaced refinements and don't depend on shapes; remove instance methods, added external capabilities "kits"; added pipe function;

## 0.1.0

### Minor Changes

- 42c1f66: Added packages for tasks, orchestration, a small react adapter for interaction ports, and some basic dataloader utilities
- 2630f02: Added sleep utility

## 0.1.0-alpha.2

### Minor Changes

- 2630f02: Added sleep utility

## 0.1.0-alpha.1

### Minor Changes

- 42c1f66: Added packages for tasks, orchestration, a small react adapter for interaction ports, and some basic dataloader utilities

## 0.1.0-alpha.0

### Minor Changes

- Initial release: `task()` with lazy execution, `retry()`, and Promise-like chaining.
