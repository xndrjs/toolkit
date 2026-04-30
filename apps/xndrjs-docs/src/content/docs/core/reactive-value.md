---
title: core → Reactive Value
seeAlso: |
  - Learn about [ComputedValue](./computed-value.md) - derived reactive values
  - Explore [StatePort](./state-port.md) - the foundation interface
  - Check out [Framework Adapters](../adapters/react/overview.md) for UI integration
---

# ReactiveValue

`ReactiveValue<T>` is the simplest implementation of `StatePort<T>`. It holds a single primitive value and notifies subscribers when the value changes.

## Class Definition

```typescript
class ReactiveValue<T> extends AbstractReactiveValue<T, T> {
  constructor(initialValue: T);

  // StatePort interface
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  subscribe(callback: (value: T) => void): () => void;

  // Additional methods
  notify(): void;
}
```

## Constructor

### `new ReactiveValue<T>(initialValue: T)`

Creates a new ReactiveValue instance.

**Type Parameter:**

- `T` - The type of the value (must be a primitive: string, number, boolean, null, undefined)

**Parameters:**

- `initialValue: T` - The initial value

**Runtime Validation:**

- Throws an error if `initialValue` is an array (use `ReactiveArray` instead)
- Throws an error if `initialValue` is an object (use `ReactiveObject` instead)

**Example:**

```typescript
const count = new ReactiveValue(0);
const name = new ReactiveValue("Alice");
const isActive = new ReactiveValue(true);
const nullable = new ReactiveValue<string | null>(null);
```

## Methods

### `get(): T`

Returns the current value.

**Returns:** The current value of type `T`

**Example:**

```typescript
const count = new ReactiveValue(10);
const current = count.get(); // 10
```

### `set(value: T | ((prev: T) => T)): void`

Updates the value. Accepts either a direct value or an updater function.

**Parameters:**

- `value: T | ((prev: T) => T)` - The new value or a function that receives the previous value and returns the new value

**Behavior:**

- Uses `Object.is()` for comparison (only notifies subscribers if value actually changed)
- Notifications are batched using `BatchContext`
- Subscribers are called asynchronously in the next microtask

**Example:**

```typescript
const count = new ReactiveValue(0);

// Direct value
count.set(10);

// Updater function
count.set((prev) => prev + 1);
count.set((prev) => prev * 2);

// Conditional update
count.set((prev) => (prev > 100 ? 0 : prev + 1));
```

### `subscribe(callback: (value: T) => void): () => void`

Subscribes to value changes. Returns an unsubscribe function.

**Parameters:**

- `callback: (value: T) => void` - Function called when the value changes

**Returns:** An unsubscribe function that removes the subscription

**Behavior:**

- The callback is called immediately with the current value when subscribing
- Callbacks are called asynchronously (batched via `BatchContext`)
- Errors in callbacks are caught and logged to console.error

**Example:**

```typescript
const count = new ReactiveValue(0);

const unsubscribe = count.subscribe((value) => {
  console.log("Count changed to:", value);
});

count.set(10); // Logs: "Count changed to: 10"
count.set(20); // Logs: "Count changed to: 20"

// Unsubscribe when done
unsubscribe();
count.set(30); // No log (unsubscribed)
```

### `notify(): void`

Manually trigger notifications to all subscribers. Useful when you've made direct mutations (not recommended).

**Example:**

```typescript
const count = new ReactiveValue(0);
// ... direct mutation (not recommended)
count.notify(); // Manually notify subscribers
```

## Supported Types

`ReactiveValue` is designed for **primitive values only**:

- `string`
- `number`
- `boolean`
- `null`
- `undefined`
- `symbol`
- `bigint`

For complex data structures, use:

- `ReactiveObject` for plain objects
- `ReactiveArray` for arrays
- `ReactiveSet` for Sets
- `ReactiveMap` for Maps

## Comparison Behavior

Values are compared using `Object.is()`:

- `NaN === NaN` is `false`, but `Object.is(NaN, NaN)` is `true`
- `0 === -0` is `true`, but `Object.is(0, -0)` is `false`
- Subscribers are only notified if the value actually changed

## Batching

Notifications can be batched using the `batched()` function. Multiple `set()` calls inside a `batched()` callback result in a single notification per subscriber. Please note that some frameworks may already have their own logics for batching (i.e. React v18+), or may operate with fine-grained UI updates (Solid, Svelte), leading to different re-render counts anyway

**Example:**

```typescript
import { batched } from "@xndrjs/core";

const count = new ReactiveValue(0);
let callCount = 0;

count.subscribe(() => {
  callCount++;
});

// Without batching: each set() triggers a notification immediately
count.set(1);
count.set(2);
count.set(3);
// callCount is 3 (one notification per set)

// With batching: all sets are batched together
batched(() => {
  count.set(1);
  count.set(2);
  count.set(3);
});
// callCount is 4 (3 from above + 1 batched notification)
```

**Note:** If you don't use `batched()`, each `set()` call triggers notifications immediately.

## Example: Counter

```typescript
import { ReactiveValue } from "@xndrjs/core";

class Counter {
  private count = new ReactiveValue(0);

  get value() {
    return this.count.get();
  }

  increment() {
    this.count.set((prev) => prev + 1);
  }

  decrement() {
    this.count.set((prev) => prev - 1);
  }

  reset() {
    this.count.set(0);
  }

  subscribe(callback: (value: number) => void) {
    return this.count.subscribe(callback);
  }
}

const counter = new Counter();
counter.subscribe((value) => {
  console.log("Counter:", value);
});

counter.increment(); // Logs: "Counter: 1"
counter.increment(); // Logs: "Counter: 2"
counter.reset(); // Logs: "Counter: 0"
```

## Framework Integration

Use framework adapters to connect ReactiveValue to your UI:

**React:**

```typescript
import { useReactiveValue } from '@xndrjs/adapter-react';

const count = new ReactiveValue(0);

function Counter() {
  const value = useReactiveValue(count);
  return <div>{value}</div>;
}
```

**Solid:**

```typescript
import { useReactiveValue } from '@xndrjs/adapter-solid';

const count = new ReactiveValue(0);

function Counter() {
  const value = useReactiveValue(count);
  return <div>{value()}</div>; // Solid accessor
}
```

**Svelte:**

```html
<script>
  import { reactiveValue } from "@xndrjs/adapter-svelte";
  const count = new ReactiveValue(0);
  const countStore = reactiveValue(() => count);
</script>

<div>{$countStore}</div>
```
