---
title: adapters → svelte → Overview
seeAlso: |
  - Learn about the [API Reference](./api.md)
  - Check out [Core documentation](../../core/overview.md)
---

# Setup

The Svelte adapter provides functions to integrate xndr with Svelte components.

## Installation

```bash
npm install @xndrjs/adapter-svelte
# or
pnpm add @xndrjs/adapter-svelte
# or
yarn add @xndrjs/adapter-svelte
```

## Peer Dependencies

- `svelte` >= 5.0.0

## Overview

The Svelte adapter provides two main functions:

- **`reactiveValue`** - Convert a `StatePort` to a Svelte store
- **`toStatePort`** - Convert a Svelte `$state` rune to a `StatePort`

## Quick Start

```html
<script>
  import { reactiveValue, toStatePort, useViewModel } from "@xndrjs/adapter-svelte";
  import { ReactiveValue, createComputed, ViewModel } from "@xndrjs/core";

  class CounterVM extends ViewModel {
    count = new ReactiveValue(0);
    doubled = createComputed(this.count)
      .as((c) => c * 2)
      .for(this);
  }

  const vm = useViewModel(() => new CounterVM());
  const countStore = reactiveValue(() => vm.count);
  const doubledStore = reactiveValue(() => vm.doubled);

  // Convert Svelte $state to StatePort
  let text = $state("");
  const textPort = toStatePort(
    () => text,
    (v) => (text = v)
  );
</script>

<div>{$countStore}</div>
<div>{$doubledStore}</div>
<input bind:value="{text}" />
```
