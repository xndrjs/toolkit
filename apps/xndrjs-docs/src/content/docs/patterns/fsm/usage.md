---
title: patterns → fsm → Usage
---

# FSM Usage

## FSMContextManager

`FSMContextManager` is a **service class** that should receive a `Disposable` owner via dependency injection, not extend `ViewModel`. The owner is responsible for cleanup of subscriptions.

### Class Definition

```typescript
class FSMContextManager<
  TConfig extends FSMStateConfig<PropertyKey, unknown>,
  TSelf extends FSMContextManager<TConfig, TSelf>,
> {
  constructor(owner: Disposable, currentStatePort: StatePort<FSMContextState<TSelf>>);

  initialize(): Promise<TSelf>;
  dispatch<T extends keyof TConfig>(payload: TConfig[T]): Promise<void>;
  transitionTo(state: FSMContextState<TSelf>): Promise<void>;
  get currentState(): StatePort<FSMContextState<TSelf>>;
}
```

## Usage Example

### In a React Component

```tsx
import { useCreateStatePort, useReactiveValue, useViewModel } from '@xndrjs/adapter-react';
import { ViewModel, type StatePort } from '@xndrjs/core';
import { FSMContextManager, type FSMContextState } from '@xndrjs/fsm';

// Define your FSM
class MyFSM extends FSMContextManager<MyConfig, MyFSM> {
  constructor(
    owner: Disposable,
    currentStatePort: StatePort<FSMContextState<MyFSM>>
  ) {
    super(owner, currentStatePort);
    // Use owner for computed values
    this.someComputed = createComputed(...)
      .as(...)
      .for(owner);
  }
}

// Create a ViewModel wrapper
class MyFSMViewModel extends ViewModel {
  readonly fsm: MyFSM;

  constructor(currentStatePort: StatePort<FSMContextState<MyFSM>>) {
    super();
    this.fsm = new MyFSM(this, currentStatePort);
    this.fsm.initialize();
  }
}

// Use in component
function MyComponent() {
  const currentStatePort = useCreateStatePort(initialState);

  const vm = useViewModel(() => new MyFSMViewModel(currentStatePort));
  const fsm = vm.fsm;

  const currentState = useReactiveValue(fsm.currentState);

  return <div>Current state: {currentState.name}</div>;
}
```

### Key Points

- `FSMContextManager` is a **service**, not a ViewModel
- It receives a `Disposable` owner via dependency injection
- Wrap it in a `ViewModel` in your component for automatic lifecycle management
- Use the owner for `.for(owner)` when creating computed values
