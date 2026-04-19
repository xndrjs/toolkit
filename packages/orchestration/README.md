# @xndrjs/orchestration

**Ports** (interfaces) for orchestrating application flows—presentation boundaries, use-case inputs—without coupling the domain to React, HTTP, or concrete UI frameworks.

Types are dependency-light and suitable for layering: application use cases depend on ports; adapters (e.g. `@xndrjs/react-adapter`) implement them.

## Installation

```bash
npm install @xndrjs/orchestration
```

## Ports

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
