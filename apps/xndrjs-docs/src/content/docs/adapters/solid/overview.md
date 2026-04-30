---
title: adapters → solid → Overview
seeAlso: |
  - Learn about the [API Reference](./api.md)
  - Check out [Core documentation](../../core/overview.md)
---

# Setup

The Solid adapter provides hooks to integrate xndr with Solid.js components.

## Installation

```bash
npm install @xndrjs/adapter-solid
# or
pnpm add @xndrjs/adapter-solid
# or
yarn add @xndrjs/adapter-solid
```

## Peer Dependencies

- `solid-js` >= 1.8.0

## Overview

The Solid adapter provides `useReactiveValue` hook that connects `StatePort` instances to Solid's reactivity system.

## Quick Start

```tsx
import { useReactiveValue, useViewModel } from "@xndrjs/adapter-solid";
import { ReactiveValue, createComputed, ViewModel } from "@xndrjs/core";

class CounterVM extends ViewModel {
  count = new ReactiveValue(0);
  doubled = createComputed(this.count)
    .as((c) => c * 2)
    .for(this);
}

function Counter() {
  const vm = useViewModel(() => new CounterVM());
  const countValue = useReactiveValue(() => vm.count); // Solid accessor
  const doubledValue = useReactiveValue(() => vm.doubled); // Solid accessor

  return (
    <div>
      <p>Count: {countValue()}</p>
      <p>Doubled: {doubledValue()}</p>
      <button onClick={() => vm.count.set((prev) => prev + 1)}>Increment</button>
    </div>
  );
}
```
