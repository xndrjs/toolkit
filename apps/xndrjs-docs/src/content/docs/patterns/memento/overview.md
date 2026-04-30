---
title: patterns → memento → Overview
seeAlso: |
  - Learn about [Usage](./usage.md)
---

# Memento Pattern (@xndrjs/memento)

Memento pattern implementation for undo/redo functionality.

## Installation

```bash
npm install @xndrjs/memento
```

## Overview

The `@xndrjs/memento` package provides:

- **MementoBaseCaretaker** - Basic undo/redo implementation
- **MementoDiffCaretaker** - Optimized implementation using diffs

## Key Concepts

- **Originator** - Object whose state needs to be saved
- **Memento** - Snapshot of the originator's state
- **Caretaker** - Manages the history of mementos
