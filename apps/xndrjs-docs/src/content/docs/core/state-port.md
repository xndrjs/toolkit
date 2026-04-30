---
title: core → State Port
seeAlso: |
  - Review [Fundamental Concepts](/docs/getting-started/concepts)
  - Learn about [ReactiveValue](./reactive-value.md) - the simplest StatePort implementation
  - Explore [ComputedValue](./computed-value.md) - derived reactive values
  - Check out [Framework Adapters](../adapters/react/overview.md) - connecting StatePort to frameworks
---

# StatePort Pattern

The `StatePort<T>` interface is the foundation of framework-agnostic state management in xndr.

## Interface Definition

```typescript
interface StatePort<T> {
  /**
   * Get current value
   */
  get(): T;

  /**
   * Set new value (supports both direct value and updater function)
   */
  set(value: T | ((prev: T) => T)): void;

  /**
   * Subscribe to changes. Returns unsubscribe function.
   * Optional: some systems (like React) might not support subscriptions
   */
  subscribe?(callback: (value: T) => void): () => void;
}
```

## Methods

### `get(): T`

Returns the current value of the StatePort.

**Returns:** The current value of type `T`

**Example:**

```typescript
const count = new ReactiveValue(0);
const currentValue = count.get(); // 0
```

### `set(value: T | ((prev: T) => T)): void`

Updates the value. Accepts either:

- A direct value of type `T`
- An updater function `(prev: T) => T` that receives the previous value and returns the new value

**Parameters:**

- `value: T | ((prev: T) => T)` - The new value or updater function

**Example:**

```typescript
const count = new ReactiveValue(0);

// Direct value
count.set(10);

// Updater function (useful for immutable updates)
count.set((prev) => prev + 1);
count.set((prev) => prev * 2);
```

### `subscribe?(callback: (value: T) => void): () => void`

Subscribes to value changes. This method is optional—some systems (like React's `useState`) don't support subscriptions.

**Parameters:**

- `callback: (value: T) => void` - Function called when the value changes

**Returns:** An unsubscribe function that removes the subscription

**Example:**

```typescript
const count = new ReactiveValue(0);

const unsubscribe = count.subscribe?.((value) => {
  console.log("Count changed to:", value);
});

count.set(10); // Logs: "Count changed to: 10"
count.set(20); // Logs: "Count changed to: 20"

// Unsubscribe when done
unsubscribe?.();
```

## Why StatePort?

The StatePort pattern provides:

1. **Framework Independence** - Your business logic doesn't depend on React, Solid, Svelte, or any specific framework
2. **Testability** - Test your logic without framework mocking
3. **Reusability** - Share code between different frameworks and projects
4. **Flexibility** - Swap frameworks without rewriting business logic

## Implementing StatePort

All reactive primitives in `@xndrjs/core` implement `StatePort`:

- `ReactiveValue<T>` implements `StatePort<T>`
- `ReactiveObject<T>` implements `StatePort<T>`
- `ReactiveArray<T>` implements `StatePort<T[]>`
- `ReactiveSet<T>` implements `StatePort<Set<T>>`
- `ReactiveMap<K, V>` implements `StatePort<Map<K, V>>`
- `ComputedValue<T>` implements `StatePort<T>` (read-only)

## Framework Integration

Framework adapters convert `StatePort` instances to framework-specific reactive primitives:

- **React**: `useReactiveValue(port)` returns the current value and re-renders on changes
- **Solid**: `useReactiveValue(port)` returns a Solid accessor function
- **Svelte**: `reactiveValue(() => port)` returns a Svelte store

See the [Framework Adapters](../adapters/react/overview.md) documentation for details.

## Type Utilities

The package exports type utilities for working with StatePort:

```typescript
import type { StatePortValue, IsStatePort } from "@xndrjs/core";

// Extract value type from a StatePort
type Count = StatePortValue<typeof countPort>; // number

// Check if a type is a StatePort
type IsPort = IsStatePort<ReactiveValue<number>>; // true
```
