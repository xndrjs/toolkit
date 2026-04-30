---
title: devtools → react → Usage
---

# Usage

## Monitoring Hooks

### useMonitorStatePort

Monitor any StatePort:

```typescript
function useMonitorStatePort<T>(
  value: StatePort<T> | null | undefined,
  options: MonitorStatePortOptions
): void;
```

**Example:**

```tsx
import { useMonitorStatePort } from "@xndrjs/devtools-react";

function Counter({ count }) {
  useMonitorStatePort(count, { name: "Counter.count" });
  // ...
}
```

### useMonitorFSM

Monitor an FSM context manager:

```typescript
function useMonitorFSM(fsm: FSMContextManager | null | undefined, options: MonitorFSMOptions): void;
```

### useMonitorMemento

Monitor a Memento caretaker:

```typescript
function useMonitorMemento(
  caretaker: MementoAbstractCaretaker | null | undefined,
  options: MonitorMementoOptions
): void;
```

## DevTools Panel

The `DevToolsPanel` component displays:

- Timeline of all events
- Instance monitoring
- FSM state transitions
- Memento history
- Messaging events (CQRS)
