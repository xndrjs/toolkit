---
title: patterns → cqrs → Event Bus
---

# EventBus

The `EventBus` publishes and subscribes to domain events.

## Class Definition

```typescript
class EventBus implements EventBusInterface {
  constructor();

  publish<TEvent extends UntypedDomainEventType>(event: TEvent): Promise<PublishResultInterface>;

  on<TEvent extends UntypedDomainEventType>(
    eventType: TEvent["type"],
    handler: LocalEventHandler<TEvent>
  ): () => void;
}
```

## Constructor

### `new EventBus()`

Creates a new EventBus instance.

**Example:**

```typescript
const eventBus = new EventBus();
```

## Methods

### `on<TEvent>(eventType, handler): () => void`

Subscribes to events of a specific type.

**Type Parameters:**

- `TEvent` - The event type (must extend `UntypedDomainEventType`)

**Parameters:**

- `eventType: TEvent["type"]` - The event type string
- `handler: LocalEventHandler<TEvent>` - The event handler
  ```typescript
  type LocalEventHandler<T extends UntypedDomainEventType> = (
    event: DomainEventInterface<T["type"], T["payload"]>
  ) => void | Promise<void>;
  ```

**Returns:** Unsubscribe function

**Example:**

```typescript
const unsubscribe = eventBus.on("TodoCreated", async (event) => {
  console.log("Todo created:", event.payload);
});
```

### `publish<TEvent>(event): Promise<PublishResultInterface>`

Publishes an event to all registered handlers.

**Type Parameters:**

- `TEvent` - The event type

**Parameters:**

- `event: TEvent` - The event to publish

**Returns:** `Promise<PublishResultInterface>` - Results from all handlers

**Example:**

```typescript
const event = new TodoCreatedEvent({ id: "123", text: "Learn xndr" });
const results = await eventBus.publish(event);
```

## Interface

```typescript
interface EventBusInterface {
  publish<TEvent extends UntypedDomainEventType>(event: TEvent): Promise<PublishResultInterface>;

  on<TEvent extends UntypedDomainEventType>(
    eventType: TEvent["type"],
    handler: LocalEventHandler<TEvent>
  ): () => void;
}
```
