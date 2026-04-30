---
title: getting-started → Concepts
seeAlso: |
  - Learn about [ReactiveValue](/docs/core/reactive-value) in detail
  - Explore [Computed Values](/docs/core/computed-value)
  - Check out [Framework Adapters](/docs/adapters/react/overview)
  - See [StatePort Pattern](/docs/core/state-port)
  - Learn about [Lifecycle Management](/docs/core/lifecycle)
---

# Fundamental Concepts

Understanding the fundamental concepts of `xndr` will help you build effective framework-agnostic state management.

## Architecture Overview

`xndr` follows a clear architectural pattern that separates concerns between the View layer, ViewModels, and business logic services:

```
Component (useViewModel)
    │
    ├─ instantiates
    |   |
    │   └ ViewModel (extends ViewModel)
    │       │
    │       └ uses/contains Service Classes (Business Logic)
    │
    └─ on unmount → [Symbol.dispose]() → SubscriptionRegistry cleanup
```

**Key Points:**

- **View Layer**: Framework-specific components (React, Solid, Svelte) use `useViewModel` hook to instantiate ViewModels
- **ViewModel Layer**: ViewModels extend `ViewModel` base class and provide automatic cleanup when components unmount
- **Service Layer**: Business logic classes using services (FSM, Memento, etc.) that receive a `Disposable` owner via dependency injection

**SubscriptionRegistry and Ownership Mechanism:**

The `SubscriptionRegistry` is a global registry that tracks all subscriptions (computed values, event handlers, intervals, WebSockets etc.) associated with a `Disposable` owner. When a ViewModel is disposed, the registry automatically cleans up all registered subscriptions.

**Ownership Pattern:**

- The ViewModel acts as the **owner** of all subscriptions created within it
- Service classes receive the ViewModel instance as a `Disposable` owner via dependency injection
- When creating subscriptions (e.g., `createComputed(...).for(owner)`), the owner is specified explicitly
- The `SubscriptionRegistry` maintains a WeakMap linking each owner to its list of unsubscribe functions
- When `[Symbol.dispose]()` is called on the ViewModel (triggered by component unmount), the registry executes all registered unsubscribe functions

**Example Flow:**

```typescript
class MyViewModel extends ViewModel {
  constructor() {
    super();
    // Computed value registers itself with SubscriptionRegistry using 'this' as owner
    this.doubled = createComputed(this.count)
      .as((c) => c * 2)
      .for(this); // 'this' is the owner

    // Service receives 'this' as owner for its subscriptions
    this.service = new MyService(this); // Passes ViewModel as Disposable owner
  }
}

// When component unmounts:
// 1. Component calls vm[Symbol.dispose]()
// 2. ViewModel's dispose() calls SubscriptionRegistry.cleanup(this)
// 3. Registry executes all unsubscribe functions registered for this ViewModel
// 4. All subscriptions are cleaned up automatically
```

This architecture ensures:

- Automatic resource cleanup when components unmount
- Framework-agnostic business logic
- Clear separation of concerns
- Easy testing without framework dependencies

## StatePort Pattern

The `StatePort` interface is the foundation of `xndr`. It provides a framework-agnostic abstraction for reactive state.

### StatePort Interface

```typescript
interface StatePort<T> {
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  subscribe(callback: (value: T) => void): () => void;
}
```

**Methods:**

- **`get()`**: returns the current value
- **`set(value)`**: updates the value (accepts a value or updater function)
- **`subscribe(callback)`**: subscribes to value changes, returns an unsubscribe function

### Why StatePort?

StatePort is an abstraction for reactive state, inspired by the "port" concept in hexagonal architecture. Just as ports define interfaces that allow your application to work with different adapters (databases, APIs, etc.), StatePort defines a common interface for reactive state. This abstraction enables you to work with `ReactiveValue` from the core package, but also inject reactive states from various frameworks (React, Solid, Svelte) when needed, making your business logic reactive to framework-specific state while remaining framework-agnostic.

The StatePort pattern allows you to write business logic that doesn't depend on any specific framework, so you can

1. swap frameworks without rewriting your business logic
2. test your logic without framework mocking
3. share code between different frontend projects

### Example

This example demonstrates how StatePort allows you to inject framework-specific state into framework-agnostic logic classes:

**React Component:**

```tsx
import { useState } from "react";
import { useStatePort, useViewModel } from "@xndrjs/adapter-react";
import { CounterVM } from "./counter-vm";

function CounterComponent() {
  // React state
  const [count, setCount] = useState(0);

  // Convert React state to StatePort
  const countPort = useStatePort(count, setCount);

  // Create ViewModel instance with automatic cleanup
  const vm = useViewModel(() => new CounterVM(countPort));

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => vm.increment()}>Increment</button>
      <button onClick={() => vm.decrement()}>Decrement</button>
    </div>
  );
}
```

**ViewModel Class:**

```typescript
import type { StatePort } from "@xndrjs/core";
import { ReactiveValue, ViewModel } from "@xndrjs/core";

export class CounterVM extends ViewModel {
  private count: StatePort<number>;

  constructor(countPort?: StatePort<number>) {
    super(); // Initialize ViewModel for automatic cleanup
    // Accept optional StatePort, create ReactiveValue if not provided
    this.count = countPort ?? new ReactiveValue(0);
  }

  increment() {
    this.count.set((prev) => prev + 1);
  }

  decrement() {
    this.count.set((prev) => prev - 1);
  }

  getValue(): number {
    return this.count.get();
  }
}
```

**Note**: in this specific case, the ViewModel class could simply accept a `number` parameter in its constructor and use it as a default value. However, this is just a toy example. The true value of the StatePort pattern, in a real case scenario, lies in its ability to integrate any framework-specific state management (e.g., `useState` in React, signals in Solid, Runes in Svelte) while keeping external classes focused solely on framework-agnostic business logic. This design also enables **progressive integration** of `xndr` into your codebase, allowing you to adopt it incrementally without requiring a full rewrite.

This pattern allows your business logic to work with:

- **Framework-specific state**: when a StatePort is passed from React (or Solid, Svelte)
- **Framework-agnostic state**: when no StatePort is provided, it can instantiate ReactiveValue internally

The business logic remains completely framework-agnostic while being reactive to framework state when needed.

## Reactive Values

`ReactiveValue` is the simplest implementation of `StatePort`. It holds a single value and notifies subscribers when the value changes.

### Creating Reactive Values

```typescript
import { ReactiveValue } from "@xndrjs/core";

const count = new ReactiveValue(0);
const name = new ReactiveValue("Alice");
const isActive = new ReactiveValue(true);
```

### Updating Values

You can update values in two ways:

```typescript
// Direct value
count.set(10);

// Updater function (useful for immutable updates)
count.set((prev) => prev + 1);
```

## Computed Values

Computed values automatically update when their dependencies change. They're derived from other `StatePort` instances.

### Creating Computed Values

```typescript
import { ReactiveValue, createComputed, ViewModel } from "@xndrjs/core";

const a = new ReactiveValue(2);
const b = new ReactiveValue(3);

// Create a computed value that depends on a and b
// In tests or global contexts, use a simple ViewModel instance
class TestViewModel extends ViewModel {}
const testOwner = new TestViewModel();
const sum = createComputed(a, b)
  .as((x, y) => x + y)
  .for(testOwner); // Owner for cleanup

console.log(sum.get()); // 5

// When dependencies change, computed value updates automatically
a.set(5);
console.log(sum.get()); // 8 (5 + 3)
```

### Memoization

Computed values are memoized by default. The computation function only runs when dependencies actually change.

## Lifecycle Management

`xndr` uses the `Disposable` pattern for cleanup. Objects that need cleanup implement `Symbol.dispose`.

### Architecture: View → ViewModel → Service

The recommended architecture follows this pattern:

1. **View Layer**: Framework components use `useViewModel` hook
2. **ViewModel Layer**: Classes that extend `ViewModel` for automatic cleanup
3. **Service Layer**: Business logic classes (can be simple or receive `Disposable` owner via DI)

**Simple Case**: When business logic is simple, the ViewModel can contain the logic directly:

```typescript
class CounterVM extends ViewModel {
  count = new ReactiveValue(0);
  // ... business logic directly in ViewModel
}
```

**Complex Case**: When business logic is complex or reusable, use a service class:

```typescript
// Service receives owner via DI
class ComplexService {
  constructor(protected owner: Disposable) {
    // Use owner for computed values, subscriptions, etc.
  }
}

// ViewModel wraps the service
class ComplexVM extends ViewModel {
  private service: ComplexService;

  constructor() {
    super();
    this.service = new ComplexService(this); // Pass 'this' as owner
  }
}
```

### ViewModel

In the View layer, instantiate `ViewModel` with framework hooks:

```typescript
import { ViewModel, ReactiveValue, createComputed } from "@xndrjs/core";
import { useViewModel } from "@xndrjs/adapter-react";

class CounterVM extends ViewModel {
  count = new ReactiveValue(0);

  doubled = createComputed(this.count)
    .as((c) => c * 2)
    .for(this); // 'this' is the owner - this requires cleanup

  increment() {
    this.count.set((prev) => prev + 1);
  }
}

// In a component, use with useViewModel for automatic cleanup
function Counter() {
  const vm = useViewModel(() => new CounterVM());
  // ... use vm
  // Cleanup happens automatically when component unmounts
}
```

## Framework Integration

`xndr` provides adapters to connect `StatePort` instances to framework reactivity systems.

**Business Logic Class:**

```typescript
import { ReactiveValue, createComputed, ViewModel } from "@xndrjs/core";

export class CounterVM extends ViewModel {
  public count = new ReactiveValue(0);

  public doubled = createComputed(this.count)
    .as((c) => c * 2)
    .for(this); // 'this' is the owner for automatic cleanup

  increment() {
    this.count.set((prev) => prev + 1);
  }

  decrement() {
    this.count.set((prev) => prev - 1);
  }
}
```

### React

```tsx
import { useReactiveValue, useViewModel } from "@xndrjs/adapter-react";
import { CounterVM } from "./counter-vm";

function Counter() {
  const vm = useViewModel(() => new CounterVM());
  const count = useReactiveValue(vm.count);
  const doubled = useReactiveValue(vm.doubled);

  return (
    <div>
      <div>Count: {count}</div>
      <div>Doubled: {doubled}</div>
      <button onClick={() => vm.increment()}>+</button>
      <button onClick={() => vm.decrement()}>-</button>
    </div>
  );
}
```

### Solid

```tsx
import { useReactiveValue } from "@xndrjs/adapter-solid";
import { CounterVM } from "./counter-vm";
import { createMemo } from "solid-js";

function Counter() {
  const vm = createMemo(() => new CounterVM());
  const count = useReactiveValue(vm().count);
  const doubled = useReactiveValue(vm().doubled); // ComputedValue works the same way

  return (
    <div>
      <div>Count: {count()}</div>
      <div>Doubled: {doubled()}</div>
      <button onClick={() => vm().increment()}>+</button>
      <button onClick={() => vm().decrement()}>-</button>
    </div>
  );
}
```

### Svelte

```html
<script>
  import { reactiveValue } from "@xndrjs/adapter-svelte";
  import { CounterVM } from "./counter-vm";

  const vm = new CounterVM();
  const countStore = reactiveValue(() => vm.count);
  const doubledStore = reactiveValue(() => vm.doubled); // ComputedValue works the same way
</script>

<div>
  <div>Count: {$countStore}</div>
  <div>Doubled: {$doubledStore}</div>
  <button on:click="{()" ="">vm.increment()}>+</button>
  <button on:click="{()" ="">vm.decrement()}>-</button>
</div>
```

## Patterns

`xndr` includes several design patterns:

- **CQRS**: Separate commands (mutations) from queries (reads)
- **FSM**: Finite State Machines for managing complex state transitions
- **Memento**: Undo/Redo functionality

See the [Patterns documentation](../patterns/cqrs/overview.md) for more details.
