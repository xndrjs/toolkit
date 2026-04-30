---
title: patterns → memento → Usage
---

# Memento Usage

## MementoBaseCaretaker

`MementoBaseCaretaker` is a **service class** that should receive a `Disposable` owner via dependency injection, not implement `Disposable`. The owner is responsible for cleanup of subscriptions.

### Class Definition

```typescript
class MementoBaseCaretaker<TMemento, Originator extends MementoBaseOriginator<TMemento>> {
  constructor(
    owner: Disposable,
    originator: Originator,
    history: StatePort<TMemento[]>,
    historyPointer: StatePort<number>
  );

  saveState(): void;
  undo(): void;
  redo(): void;

  get history(): StatePort<TMemento[]>;
  get historyPointer(): StatePort<number>;
  get canUndo(): ComputedValue<boolean>;
  get canRedo(): ComputedValue<boolean>;
}
```

## Usage Example

### In a React Component

```tsx
import { useCreateStatePort, useViewModel } from "@xndrjs/adapter-react";
import { ViewModel, type StatePort, type Disposable } from "@xndrjs/core";
import { MementoBaseCaretaker } from "@xndrjs/memento";
import type { MementoBaseOriginator } from "@xndrjs/memento";

// Define your originator
class TodoListOriginator implements MementoBaseOriginator<Todo[]> {
  constructor(private todosPort: StatePort<Todo[]>) {}

  getMemento(): Todo[] | null {
    return this.todosPort.get();
  }

  restoreMemento(memento: Todo[]): void {
    this.todosPort.set(memento);
  }
}

// Create a ViewModel wrapper
class TodoListViewModel extends ViewModel {
  readonly caretaker: MementoBaseCaretaker<Todo[], TodoListOriginator>;

  constructor(
    todosPort: StatePort<Todo[]>,
    historyPort: StatePort<Todo[][]>,
    historyPointerPort: StatePort<number>
  ) {
    super();
    const originator = new TodoListOriginator(todosPort);
    this.caretaker = new MementoBaseCaretaker(
      this, // Pass this as owner
      originator,
      historyPort,
      historyPointerPort
    );
  }
}

// Use in component
function TodoList() {
  const todosPort = useCreateStatePort<Todo[]>([]);
  const historyPort = useCreateStatePort<Todo[][]>([]);
  const historyPointerPort = useCreateStatePort<number>(0);

  const vm = useViewModel(() => new TodoListViewModel(todosPort, historyPort, historyPointerPort));
  const caretaker = vm.caretaker;

  // Use caretaker methods
  const canUndo = useReactiveValue(caretaker.canUndo);
  const canRedo = useReactiveValue(caretaker.canRedo);

  return (
    <div>
      <button onClick={() => caretaker.undo()} disabled={!canUndo}>
        Undo
      </button>
      <button onClick={() => caretaker.redo()} disabled={!canRedo}>
        Redo
      </button>
    </div>
  );
}
```

### Key Points

- `MementoBaseCaretaker` is a **service**, not a ViewModel
- It receives a `Disposable` owner via dependency injection
- Wrap it in a `ViewModel` in your component for automatic lifecycle management
- Use the owner for `.for(owner)` when creating computed values
