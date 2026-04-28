# @xndrjs/react-adapter

React **hooks** that implement interaction **ports** from `@xndrjs/orchestration`, wiring component state to the same interfaces your use cases already expect.

## Installation

```bash
npm install @xndrjs/react-adapter @xndrjs/orchestration react
```

**Peer:** `react` **^18.3** or **^19**.  
**Dependency:** `@xndrjs/orchestration` (install it alongside this package).

## `useAsyncData`

Maps UI state to **`AsyncDataInteractionPort<T, E>`**:

- **`data`** / **`setData`** semantics via **`port.displayData`**
- **`isLoading`** via **`port.startLoading`** / **`port.endLoading`**
- **`error`** via **`port.displayError`**

```tsx
import { useAsyncData } from "@xndrjs/react-adapter";

function Panel() {
  const { data, isLoading, error, port } = useAsyncData({ items: [] });

  useEffect(() => {
    void loadItems(port);
  }, [port]);

  // …
}
```

Generic second type parameter narrows **`displayError`** when you use a custom error model: **`useAsyncData<Data, AppError>(initial)`**.

## Caveats

- Hook APIs are intentionally thin adapters; orchestration rules should remain in use-cases, not in components.
- `port` identity follows hook lifecycle, so keep standard React memoization/effect dependency practices.

## License

MIT
