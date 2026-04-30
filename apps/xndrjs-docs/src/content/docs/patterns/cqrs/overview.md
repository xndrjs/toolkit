---
title: patterns → cqrs → Overview
seeAlso: |
  - Learn about [CommandBus](./command-bus.md)
  - Explore [QueryBus](./query-bus.md)
  - Check out [EventBus](./event-bus.md)
---

# CQRS Pattern (@xndrjs/cqrs)

Command Query Responsibility Segregation (CQRS) separates commands (mutations) from queries (reads) for better scalability and maintainability.

## Installation

```bash
npm install @xndrjs/cqrs
```

## Overview

The `@xndrjs/cqrs` package provides three main buses:

- **CommandBus** - Handles commands (mutations/actions)
- **QueryBus** - Handles queries (reads)
- **EventBus** - Publishes and subscribes to domain events

## Key Concepts

### Commands

Commands represent actions that change state. They don't return values, only success/error.

```typescript
class CreateTodoCommand extends Command<"CreateTodo", { text: string }> {
  constructor(payload: { text: string }) {
    super("CreateTodo", payload);
  }
}
```

### Queries

Queries represent read operations. They return results.

```typescript
class GetTodosQuery extends Query<"GetTodos", {}, Todo[]> {
  constructor() {
    super("GetTodos", {});
  }
}
```

### Events

Events represent something that happened in the domain.

```typescript
class TodoCreatedEvent extends DomainEvent<"TodoCreated", { id: string; text: string }> {
  constructor(payload: { id: string; text: string }) {
    super("TodoCreated", payload);
  }
}
```
