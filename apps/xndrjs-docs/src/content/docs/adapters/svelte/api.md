---
title: adapters → svelte → Api
---

# API Reference

## reactiveValue

Convert a `StatePort` to a Svelte `Writable` store.

### Function Signature

```typescript
function reactiveValue<T>(getPort: () => StatePort<T>): Writable<T>;
```

**Type Parameters:**

- `T` - The type of the value

**Parameters:**

- `getPort: () => StatePort<T>` - A function that returns the StatePort (required for reactive tracking of props)

**Returns:** A Svelte `Writable<T>` store

**Behavior:**

- Requires a function (not the port directly) to enable reactive tracking of props
- Returns a Svelte store that can be used with `$store` syntax
- The store is reactive and updates when the StatePort value changes

**Example:**

```html
<script>
  import { reactiveValue } from "@xndrjs/adapter-svelte";
  import { ReactiveValue } from "@xndrjs/core";

  // For static ports
  const count = new ReactiveValue(1);
  const countStore = reactiveValue(() => count);

  // For reactive props (no $derived needed!)
  let { todoListService } = $props();
  const todosStore = reactiveValue(() => todoListService.todos);
</script>

<div>{$countStore}</div>
<div>{$todosStore}</div>
```

## toStatePort

Convert a Svelte `$state` rune to a `StatePort`.

### Function Signature

```typescript
function toStatePort<T>(getState: () => T, setState: (value: T) => void): StatePort<T>;
```

**Type Parameters:**

- `T` - The type of the value

**Parameters:**

- `getState: () => T` - Function that returns the current state value
- `setState: (value: T) => void` - Function that sets the state value

**Returns:** A `StatePort<T>` instance

**Behavior:**

- Converts Svelte `$state` variables to `StatePort` for use with xndr APIs
- The returned `StatePort` supports both direct values and updater functions in `set()`
- Subscriptions are handled using Svelte's reactivity system

**Example:**

```html
<script>
  import { toStatePort } from '@xndrjs/adapter-svelte';
  import { createComputed } from '@xndrjs/core';

  let text = $state("");
  const textPort = toStatePort(() => text, (v) => text = v);

  // Use the port with xndr APIs
  class TextLengthVM extends ViewModel {
    textLength: ComputedValue<number>;

    constructor(textPort: StatePort<string>) {
      super();
      this.textLength = createComputed(textPort)
        .as((t) => t.length)
        .for(this);
    }
  }

  const textLengthVM = useViewModel(() => new TextLengthVM(textPort));
</script>

<input bind:value="{text}" />
<p>Length: {textLengthVM.textLength.get()}</p>
```
