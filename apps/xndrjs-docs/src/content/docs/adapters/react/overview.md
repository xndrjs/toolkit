---
title: adapters → react → Overview
seeAlso: |
  - Learn about the [API Reference](./api.md)
  - Check out examples in the [Core documentation](../../core/overview.md)
  - Explore [Pattern packages](../../patterns/cqrs/overview.md)
---

# Setup

The React adapter provides hooks to integrate xndr with React components.

## Installation

```bash
npm install @xndrjs/adapter-react
# or
pnpm add @xndrjs/adapter-react
# or
yarn add @xndrjs/adapter-react
```

## Peer Dependencies

- `react` >= 18.0.0
- `react-dom` >= 18.0.0

## Overview

The React adapter provides hooks that connect `StatePort` instances to React's reactivity system:

- **`useReactiveValue`** - Subscribe to a `StatePort` and re-render when the value changes
- **`useStatePort`** - Convert React `useState` to a `StatePort`
- **`useCreateStatePort`** - Create a `StatePort` with React state management
- **`useViewModel`** - Create and manage ViewModel instances with automatic cleanup

## Quick Start

```tsx
import { useReactiveValue, useCreateStatePort } from "@xndrjs/adapter-react";
import { ReactiveValue, createComputed } from "@xndrjs/core";

// Use a reactive value in a component
function Counter() {
  const count = new ReactiveValue(0);
  const value = useReactiveValue(count);

  return (
    <div>
      <p>Count: {value}</p>
      <button onClick={() => count.set((prev) => prev + 1)}>Increment</button>
    </div>
  );
}

// Create a StatePort from React state
function TodoList() {
  const todosPort = useCreateStatePort<Todo[]>([]);
  const todos = useReactiveValue(todosPort);

  const addTodo = (todo: Todo) => {
    todosPort.set((prev) => [...prev, todo]);
  };

  return (
    <div>
      {todos.map((todo) => (
        <div key={todo.id}>{todo.text}</div>
      ))}
      <button onClick={() => addTodo({ id: Date.now(), text: "New todo" })}>Add Todo</button>
    </div>
  );
}
```
