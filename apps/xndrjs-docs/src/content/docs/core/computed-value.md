---
title: core → Computed Value
seeAlso: |
  - Learn about [Lifecycle Management](./lifecycle.md) - cleanup and disposal
  - Explore [ReactiveValue](./reactive-value.md) - the simplest reactive primitive
  - Check out [Framework Adapters](../adapters/react/overview.md) for UI integration
---

# ComputedValue

`ComputedValue<T>` automatically updates when its dependencies change. It's derived from other `StatePort` instances.

## Interface Definition

```typescript
interface ComputedValue<T> extends StatePort<T> {
  /**
   * Dependencies of this computed value.
   * Used by framework adapters to subscribe and recompute.
   */
  dependencies: ReadonlyArray<StatePort<any>>;

  // StatePort interface
  get(): T;
  set(value: T | ((prev: T) => T)): void; // Always throws (read-only)
  subscribe?(callback: (value: T) => void): () => void;
}
```

## Creating Computed Values

Use the `createComputed` function with a builder pattern:

```typescript
function createComputed<Ds extends readonly StatePort<any>[]>(
  ...dependencies: Ds
): ComputedComputeBuilder<Ds>;
```

### Builder Pattern

```typescript
const computed = createComputed(dep1, dep2, ...)
  .as((value1, value2, ...) => computedValue)
  .for(owner);
```

**Steps:**

1. **`createComputed(...dependencies)`** - Declare dependencies
2. **`.as(compute)`** - Define the computation function
3. **`.for(owner)`** - Provide a Disposable owner for cleanup

### Function Signature

```typescript
createComputed<Ds extends readonly StatePort<any>[]>(
  ...dependencies: Ds
): {
  as<T>(
    compute: (...values: {
      [K in keyof Ds]: ReturnType<Ds[K]["get"]>
    }) => T
  ): {
    for(owner: Disposable): ComputedValue<T>;
  };
}
```

**Type Parameters:**

- `Ds` - Tuple type of dependency StatePorts (inferred from arguments)

**Parameters:**

- `...dependencies: Ds` - One or more StatePort dependencies

**Returns:** Builder object with `.as()` method

## Computation Function

The `.as()` method accepts a function that receives dependency values and returns the computed value:

```typescript
.as<T>(
  compute: (...values: {
    [K in keyof Ds]: ReturnType<Ds[K]["get"]>
  }) => T
)
```

**Type Parameters:**

- `T` - The type of the computed value (inferred from return type)

**Parameters:**

- `compute` - Function that receives dependency values and returns computed value
  - Receives values in the same order as dependencies
  - Type is inferred: `ReturnType<Ds[K]["get"]>` for each dependency

**Returns:** Builder object with `.for()` method

## Owner (Disposable)

The `.for()` method requires a `Disposable` owner for cleanup:

```typescript
.for(owner: Disposable): ComputedValue<T>
```

**Parameters:**

- `owner: Disposable` - Object with `[Symbol.dispose]()` method

**Returns:** `ComputedValue<T>` instance

**Common Owners:**

- `ViewModel` classes (using `this`)
- Custom objects implementing `Disposable`

## Methods

### `get(): T`

Returns the current computed value. The computation function is called if dependencies have changed.

**Returns:** The current computed value of type `T`

**Memoization:** The result is memoized. The computation only runs when dependencies change (checked using `Object.is()`).

**Example:**

```typescript
const a = new ReactiveValue(2);
const b = new ReactiveValue(3);

const sum = createComputed(a, b)
  .as((x, y) => x + y)
  .for(owner);

console.log(sum.get()); // 5 (computed: 2 + 3)
a.set(5);
console.log(sum.get()); // 8 (recomputed: 5 + 3)
console.log(sum.get()); // 8 (cached, no recomputation)
```

### `set(value: T | ((prev: T) => T)): void`

**Always throws an error.** Computed values are read-only.

```typescript
sum.set(10); // Error: "Computed values are read-only"
```

### `subscribe(callback: (value: T) => void): () => void`

Subscribes to computed value changes. Returns an unsubscribe function.

**Parameters:**

- `callback: (value: T) => void` - Function called when the computed value changes

**Returns:** An unsubscribe function

**Behavior:**

- Notifications are deduplicated using `queueMicrotask`
- If multiple dependencies change in the same tick, only one notification is sent
- The callback receives the latest computed value after all dependencies have updated

**Example:**

```typescript
const a = new ReactiveValue(2);
const b = new ReactiveValue(3);

const sum = createComputed(a, b)
  .as((x, y) => x + y)
  .for(owner);

let notificationCount = 0;
sum.subscribe?.((value) => {
  notificationCount++;
  console.log("Sum:", value);
});

// Change both dependencies in the same tick
a.set(10);
b.set(20);
// After microtask: notificationCount is 1 (deduplicated)
// Logs: "Sum: 30" (latest value after both changes)
```

### `dependencies: ReadonlyArray<StatePort<any>>`

Read-only array of dependency StatePorts. Framework adapters use this to subscribe to dependencies.

**Example:**

```typescript
const computed = createComputed(a, b, c)
  .as((x, y, z) => x + y + z)
  .for(owner);

console.log(computed.dependencies); // [a, b, c]
```

## Memoization

Computed values are memoized by default:

- The computation function only runs when dependencies change
- Dependencies are compared using `Object.is()`
- The cached result is returned if dependencies haven't changed

**Example:**

```typescript
let computationCount = 0;

const computed = createComputed(a, b)
  .as((x, y) => {
    computationCount++;
    return x + y;
  })
  .for(owner);

computed.get(); // computationCount = 1
computed.get(); // computationCount = 1 (cached)
a.set(5); // dependency changed
computed.get(); // computationCount = 2 (recomputed)
computed.get(); // computationCount = 2 (cached)
```

## Notification Deduplication

When multiple dependencies change in the same execution context, notifications are deduplicated:

- Uses `queueMicrotask` to batch notifications
- Only one notification is sent per subscriber, even if multiple dependencies change
- The callback receives the latest computed value after all changes

**Example:**

```typescript
const a = new ReactiveValue(1);
const b = new ReactiveValue(2);

const sum = createComputed(a, b)
  .as((x, y) => x + y)
  .for(owner);

let callCount = 0;
sum.subscribe?.(() => {
  callCount++;
});

// Multiple dependency changes in the same tick
a.set(10);
b.set(20);
a.set(15);
// After microtask: callCount is 1 (deduplicated)
// Callback receives sum = 15 + 20 = 35
```

## Examples

### Simple Sum

```typescript
import { ReactiveValue, createComputed, ViewModel } from "@xndrjs/core";

class Calculator extends ViewModel {
  private a = new ReactiveValue(2);
  private b = new ReactiveValue(3);

  public sum = createComputed(this.a, this.b)
    .as((x, y) => x + y)
    .for(this);

  setA(value: number) {
    this.a.set(value);
  }

  setB(value: number) {
    this.b.set(value);
  }
}

const calc = new Calculator();
console.log(calc.sum.get()); // 5

calc.setA(10);
console.log(calc.sum.get()); // 13
```

### Nested Computed Values

```typescript
const a = new ReactiveValue(2);
const b = new ReactiveValue(3);

const sum = createComputed(a, b)
  .as((x, y) => x + y)
  .for(owner);

const doubled = createComputed(sum)
  .as((s) => s * 2)
  .for(owner);

console.log(doubled.get()); // 10 ((2 + 3) * 2)

a.set(5);
console.log(doubled.get()); // 16 ((5 + 3) * 2)
```

### Conditional Logic

```typescript
const count = new ReactiveValue(0);
const threshold = new ReactiveValue(100);

const status = createComputed(count, threshold)
  .as((c, t) => (c > t ? "high" : "low"))
  .for(owner);

console.log(status.get()); // 'low'

count.set(150);
console.log(status.get()); // 'high'
```

## Framework Integration

Computed values work seamlessly with framework adapters:

**React:**

```typescript
import { useReactiveValue } from '@xndrjs/adapter-react';

const sum = createComputed(a, b)
  .as((x, y) => x + y)
  .for(owner);

function SumDisplay() {
  const value = useReactiveValue(sum);
  return <div>Sum: {value}</div>;
}
```

**Solid:**

```typescript
import { useReactiveValue } from '@xndrjs/adapter-solid';

function SumDisplay() {
  const value = useReactiveValue(sum);
  return <div>Sum: {value()}</div>;
}
```

**Svelte:**

```html
<script>
  import { reactiveValue } from "@xndrjs/adapter-svelte";
  const sumStore = reactiveValue(() => sum);
</script>

<div>Sum: {$sumStore}</div>
```
