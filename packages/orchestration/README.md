# @xndrjs/orchestration

Lightweight building blocks for application orchestration: **ports** for UI and application boundaries.

## Installation

The package declares **`zod` ^4** as a peer dependency (aligned with `@xndrjs/branded` if you use both). Install `zod` alongside this package so dependency managers resolve a single instance.

```bash
npm install @xndrjs/orchestration zod@^4
```

**Runtime:** Node.js **18+** (`engines` in `package.json`).

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

## Caveats

- This package does not provide a DI container or use-case wrapper; keep orchestration and error mapping in your app layer.

## License

MIT
