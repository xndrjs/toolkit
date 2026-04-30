---
title: core → Lifecycle
seeAlso: |
  - Learn about [ReactiveValue](./reactive-value.md) and [ComputedValue](./computed-value.md)
  - Explore [Framework Adapters](../adapters/react/overview.md) for framework integration
  - Check out [Pattern Packages](../patterns/cqrs/overview.md) for complex state management
---

# Lifecycle Management

xndr uses the `Disposable` pattern for automatic cleanup of resources and subscriptions.

## Disposable Interface

```typescript
interface Disposable {
  [Symbol.dispose](): void;
}
```

Any object implementing `[Symbol.dispose]()` is considered disposable and can be used with xndr lifecycle management.

## ViewModel

`ViewModel` is a base class to be instantiated in the View layer, that provides automatic cleanup of resources and subscriptions. ViewModels are intended to be used with framework-specific hooks (e.g., `useViewModel` in React) for automatic lifecycle management.

### Class Definition

```typescript
abstract class ViewModel implements Disposable {
  readonly disposed: boolean;
  [Symbol.dispose](): void;
}
```

### Usage

Extend `ViewModel` to get automatic cleanup:

```typescript
import { ViewModel, ReactiveValue, createComputed } from "@xndrjs/core";

class CounterVM extends ViewModel {
  count = new ReactiveValue(0);

  doubled = createComputed(this.count)
    .as((c) => c * 2)
    .for(this); // 'this' is the owner

  increment() {
    this.count.set((prev) => prev + 1);
  }
}

// In a component, use with useViewModel hook for automatic cleanup
```

### Automatic Cleanup

When a `ViewModel` is disposed:

- All computed values created with `.for(this)` are cleaned up
- Subscriptions registered in `SubscriptionsRegistry` are unsubscribed
- The `[Symbol.dispose]()` method is called automatically
- The `disposed` flag is set to `true` (useful for React Strict Mode)

## SubscriptionsRegistry

`SubscriptionsRegistry` helps manage subscriptions that need cleanup:

### Class Definition

```typescript
class SubscriptionsRegistry {
  static register(owner: Disposable, unsubscribe: () => void): void;
  static cleanup(owner: Disposable): void;
}
```

### Usage

```typescript
import { SubscriptionsRegistry } from "@xndrjs/core";

class MyViewModel extends ViewModel {
  private port: StatePort<number>;

  constructor(port: StatePort<number>) {
    super();
    this.port = port;

    // Register subscription for cleanup
    const unsubscribe = this.port.subscribe?.(() => {
      // handle change
    });
    if (unsubscribe) {
      SubscriptionsRegistry.register(this, unsubscribe);
    }
  }

  // No need to override [Symbol.dispose]() - cleanup is automatic!
}
```

## Resource Helpers

xndr provides helper functions to automatically manage browser resources (intervals, timeouts, event listeners, etc.) through `SubscriptionsRegistry`. These helpers eliminate the need for explicit cleanup code.

### Available Helpers

- **`createInterval(owner, fn, delay)`** - Creates an interval that is automatically cleared when owner is disposed
- **`createTimeout(owner, fn, delay)`** - Creates a timeout that is automatically cleared if owner is disposed before it fires
- **`createEventListener(owner, target, event, handler, options?)`** - Adds an event listener that is automatically removed when owner is disposed
- **`createAbortController(owner)`** - Creates an AbortController for cancelling fetch requests, automatically aborted on dispose
- **`createWebSocket(owner, url, protocols?)`** - Creates a WebSocket connection that is automatically closed on dispose
- **`createAnimationFrame(owner, callback)`** - Creates an animation frame request that is automatically cancelled on dispose
- **`createIntersectionObserver(owner, callback, options?)`** - Creates an IntersectionObserver that is automatically disconnected on dispose

### Usage Example

```typescript
import { ViewModel, createInterval, createEventListener } from "@xndrjs/core";

class TimerVM extends ViewModel {
  constructor() {
    super();

    // Interval is automatically cleared when ViewModel is disposed
    createInterval(
      this,
      () => {
        console.log("Tick");
      },
      1000
    );

    // Event listener is automatically removed when ViewModel is disposed
    createEventListener(this, window, "resize", () => {
      console.log("Window resized");
    });
  }
}
```

### Using Helpers in Services

When creating services that receive an owner via dependency injection, use the owner parameter:

```typescript
import { createInterval, type Disposable } from "@xndrjs/core";
import { FSMContextManager } from "@xndrjs/fsm";
import type { StatePort, FSMContextState } from "@xndrjs/core";

class MyFSM extends FSMContextManager<MyConfig, MyFSM> {
  constructor(owner: Disposable, currentStatePort: StatePort<FSMContextState<MyFSM>>) {
    super(owner, currentStatePort);

    // Use the owner for automatic cleanup
    createInterval(
      owner,
      () => {
        // Periodic task
      },
      1000
    );
  }
}

// In a state's onEnter method
class PlayingState implements FSMState<MyFSM, "playing"> {
  async onEnter(context: MyFSM): Promise<void> {
    // Access owner via context.owner
    createInterval(
      context.owner,
      () => {
        context.doSomething();
      },
      1000
    );
  }
}
```

### Benefits

- **No explicit cleanup needed** - Resources are automatically cleaned up when the owner is disposed
- **Prevents memory leaks** - All resources are tracked and cleaned up together
- **Consistent pattern** - Same approach for all resource types
- **Type-safe** - Full TypeScript support with proper types

## Using with Framework

### React

In React, use the `useViewModel` hook for automatic cleanup:

```typescript
import { useViewModel } from '@xndrjs/adapter-react';
import { ViewModel, ReactiveValue, createComputed } from '@xndrjs/core';
import { useReactiveValue } from '@xndrjs/adapter-react';

class CounterVM extends ViewModel {
  count = new ReactiveValue(0);
  doubled = createComputed(this.count)
    .as((c) => c * 2)
    .for(this);

  increment() {
    this.count.set((prev) => prev + 1);
  }
}

function Counter() {
  const vm = useViewModel(() => new CounterVM());
  const count = useReactiveValue(vm.count);
  const doubled = useReactiveValue(vm.doubled);

  return (
    <div>
      <div>Count: {count}</div>
      <div>Doubled: {doubled}</div>
      <button onClick={() => vm.increment()}>+</button>
    </div>
  );
}
```

**React Strict Mode**: The `useViewModel` hook automatically handles React Strict Mode (where cleanup runs twice in development) by checking the `disposed` flag and recreating the ViewModel if needed.

### Solid

In Solid, use `useViewModel` hook:

```typescript
import { useViewModel } from '@xndrjs/adapter-solid';
import { ViewModel, ReactiveValue, createComputed } from '@xndrjs/core';
import { useReactiveValue } from '@xndrjs/adapter-solid';

class CounterVM extends ViewModel {
  count = new ReactiveValue(0);
  doubled = createComputed(this.count)
    .as((c) => c * 2)
    .for(this);

  increment() {
    this.count.set((prev) => prev + 1);
  }
}

function Counter() {
  const vm = useViewModel(() => new CounterVM());
  const count = useReactiveValue(() => vm.count);
  const doubled = useReactiveValue(() => vm.doubled);

  return (
    <div>
      <div>Count: {count()}</div>
      <div>Doubled: {doubled()}</div>
      <button onClick={() => vm.increment()}>+</button>
    </div>
  );
}
```

### Svelte

In Svelte, use `useViewModel` hook:

```html
<script>
  import { useViewModel } from "@xndrjs/adapter-svelte";
  import { reactiveValue } from "@xndrjs/adapter-svelte";
  import { ViewModel, ReactiveValue, createComputed } from "@xndrjs/core";

  class CounterVM extends ViewModel {
    count = new ReactiveValue(0);
    doubled = createComputed(this.count)
      .as((c) => c * 2)
      .for(this);

    increment() {
      this.count.set((prev) => prev + 1);
    }
  }

  const vm = useViewModel(() => new CounterVM());
  const count = reactiveValue(() => vm.count);
  const doubled = reactiveValue(() => vm.doubled);
</script>

<div>Count: {$count}</div>
<div>Doubled: {$doubled}</div>
<button on:click="{()" ="">vm.increment()}>+</button>
```

## Best Practices

1. **Always dispose resources** - Prevent memory leaks by disposing ViewModels when done
2. **Instantiate ViewModel in the View layer** - ViewModels are intended to be instantiated in the View layer, use with `useViewModel` hook
3. **Use dependency injection for services** - Services should receive `Disposable` owner via constructor, not extend `ViewModel`
4. **Use resource helpers** - Prefer `createInterval`, `createEventListener`, etc. over manual resource management
5. **Register subscriptions** - Use `SubscriptionsRegistry` or computed `.for()` for cleanup
6. **Don't dispose shared resources** - Only dispose resources you own

## Example: ViewModel with Service Pattern

For simple cases, implement logic directly in ViewModel:

```typescript
import { ViewModel, ReactiveValue, createComputed } from "@xndrjs/core";

class TodoVM extends ViewModel {
  todos = new ReactiveValue<Todo[]>([]);
  todoCount = createComputed(this.todos)
    .as((todos) => todos.length)
    .for(this);

  addTodo(todo: Todo) {
    this.todos.set((prev) => [...prev, todo]);
  }
}

// Usage in component
function TodoApp() {
  const vm = useViewModel(() => new TodoVM());
  const todos = useReactiveValue(vm.todos);
  const count = useReactiveValue(vm.todoCount);
  // ... component code
}
```

For complex cases with reusable services, use dependency injection:

```typescript
import {
  ViewModel,
  ReactiveValue,
  createComputed,
  SubscriptionsRegistry,
  type Disposable,
  type StatePort,
  type ComputedValue,
} from "@xndrjs/core";

// Service receives owner via DI
class TodoService {
  todos: ReactiveValue<Todo[]>;
  todoCount: ComputedValue<number>;

  constructor(
    protected owner: Disposable,
    externalPort: StatePort<Todo[]>
  ) {
    this.todos = new ReactiveValue<Todo[]>([]);
    this.todoCount = createComputed(this.todos)
      .as((todos) => todos.length)
      .for(owner);

    // Subscribe to external port
    const unsubscribe = externalPort.subscribe?.((todos) => {
      this.todos.set(todos);
    });
    if (unsubscribe) {
      SubscriptionsRegistry.register(owner, unsubscribe);
    }
  }

  addTodo(todo: Todo) {
    this.todos.set((prev) => [...prev, todo]);
  }
}

// ViewModel uses the service
class TodoVM extends ViewModel {
  private service: TodoService;

  constructor(externalPort: StatePort<Todo[]>) {
    super();
    this.service = new TodoService(this, externalPort);
  }

  get todos() {
    return this.service.todos;
  }
  get todoCount() {
    return this.service.todoCount;
  }
  addTodo(todo: Todo) {
    this.service.addTodo(todo);
  }
}

// Usage in component
function TodoApp() {
  const vm = useViewModel(() => new TodoVM(externalPort));
  const todos = useReactiveValue(vm.todos);
  const count = useReactiveValue(vm.todoCount);
  // ... component code
}
```
