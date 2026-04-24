# @xndrjs/orchestration

Lightweight building blocks for application orchestration:

- orchestration ports (UI/application boundaries)
- `createUseCase` to apply output boundaries consistently

## Installation

```bash
npm install @xndrjs/orchestration
```

## Quick start

```ts
import { createUseCase } from "@xndrjs/orchestration";

const makeGetUser = createUseCase((deps: { repo: UserRepo }) => async (id: string) => {
  return deps.repo.getById(id); // may contain branded domain values
});

const getUser = makeGetUser({ repo });
const user = await getUser("u-1"); // anemic output by default
```

`createUseCase` enforces a clean output boundary by converting results to anemic data.

## API

### `createUseCase`

```ts
createUseCase(
  (deps) =>
    (...args) =>
      result
);
```

- first function receives runtime dependencies
- second function is the use-case executor
- returned executor is async and returns anemic output

### Ports

### `AsyncDataInteractionPort<Data, Err>`

Drive loading, success, and error presentation for a single asynchronous **slice** of data:

- **`startLoading()` / `endLoading()`** — loading lifecycle (pair with `try`/`finally` in callers when useful).
- **`displayData(data)`** — push a successful value.
- **`displayError(error)`** — surface a failure (**`Err`**, defaults to **`Error`**).

Compose larger screens by nesting ports on a single host interface (for example **`document`** and **`invoice`** slices, plus feature-specific callbacks).

```ts
import type { AsyncDataInteractionPort } from "@xndrjs/orchestration";

interface InvoiceScreenPort {
  document: AsyncDataInteractionPort<DocumentDTO>;
  invoice: AsyncDataInteractionPort<InvoiceDTO>;
  onInvoiceValidated: () => void;
}
```

New ports can be added under `src/ports/` and re-exported from the package entry.

## Caveats

- `createUseCase` is an output-boundary helper, not a DI container.
- Error mapping policy stays your responsibility (throw domain errors, map in adapters, etc.).

## License

MIT
