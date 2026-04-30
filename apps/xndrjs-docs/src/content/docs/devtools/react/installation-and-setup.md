---
title: devtools → react → Installation And Setup
---

# Installation and Setup

## Basic Setup

1. Wrap your app with `DevToolsProvider`:

```tsx
import { DevToolsProvider, DevToolsPanel } from "@xndrjs/devtools-react";

function App() {
  return (
    <DevToolsProvider>
      <YourApp />
      <DevToolsPanel />
    </DevToolsProvider>
  );
}
```

2. Use monitoring hooks in your components:

```tsx
import { useMonitorStatePort } from "@xndrjs/devtools-react";

function MyComponent({ service }) {
  useMonitorStatePort(service.count, { name: "Count" });
  // Component logic...
}
```

## Server-Side Usage

DevTools also works server-side:

```typescript
import { initDevTools, monitor } from "@xndrjs/devtools-react";

initDevTools();

monitor.reactiveValue.track(count, { name: "Count" });
```
