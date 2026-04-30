---
title: adapters → solid → Api
---

# API Reference

## useReactiveValue

Subscribe to a `StatePort` and return a Solid accessor function.

### Function Signature

```typescript
function useReactiveValue<T>(port: StatePort<T>): Accessor<T>;
```

**Type Parameters:**

- `T` - The type of the value

**Parameters:**

- `port: StatePort<T>` - The StatePort to subscribe to

**Returns:** A Solid `Accessor<T>` function (call it to get the current value: `value()`)

**Behavior:**

- Returns a Solid accessor function (not the value directly)
- The accessor is reactive and will trigger re-computations when the value changes
- Must be called as a function: `const value = useReactiveValue(port); value();`

**Example:**

```tsx
import { useReactiveValue } from "@xndrjs/adapter-solid";
import { ReactiveValue } from "@xndrjs/core";

function Counter() {
  const count = new ReactiveValue(0);
  const value = useReactiveValue(count); // Accessor function

  return (
    <div>
      <p>Count: {value()}</p>
      <button onClick={() => count.set((prev) => prev + 1)}>Increment</button>
    </div>
  );
}
```
