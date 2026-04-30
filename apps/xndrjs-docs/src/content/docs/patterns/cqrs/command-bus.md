---
title: patterns → cqrs → Command Bus
---

# CommandBus

The `CommandBus` handles commands (mutations/actions) in a CQRS architecture.

## Class Definition

```typescript
class CommandBus implements CommandBusInterface {
  constructor(props?: CommandBusConstructorProps);

  dispatch<TCommand extends UntypedCommandType>(command: TCommand): Promise<void>;

  register<TCommand extends UntypedCommandType>(handler: CommandHandlerInterface<TCommand>): void;
}
```

## Constructor

### `new CommandBus(props?: CommandBusConstructorProps)`

Creates a new CommandBus instance.

**Parameters:**

- `props?: CommandBusConstructorProps` - Optional configuration
  ```typescript
  interface CommandBusConstructorProps {
    remoteSender?: RemoteCommandSenderInterface | null;
    monitoringService?: MonitoringService | null;
  }
  ```

**Example:**

```typescript
const commandBus = new CommandBus();
// or with options
const commandBus = new CommandBus({
  remoteSender: myRemoteSender,
  monitoringService: myMonitoringService,
});
```

## Methods

### `register<TCommand>(handler: CommandHandlerInterface<TCommand>): void`

Registers a command handler.

**Type Parameters:**

- `TCommand` - The command type (must extend `UntypedCommandType`)

**Parameters:**

- `handler: CommandHandlerInterface<TCommand>` - The handler function
  ```typescript
  interface CommandHandlerInterface<TCommand extends UntypedCommandType> {
    (command: TCommand): Promise<void>;
  }
  ```

**Example:**

```typescript
commandBus.register(async (command: CreateTodoCommand) => {
  // Handle command
  await todosRepository.create(command.payload);
});
```

### `dispatch<TCommand>(command: TCommand): Promise<void>`

Dispatches a command to registered handlers.

**Type Parameters:**

- `TCommand` - The command type

**Parameters:**

- `command: TCommand` - The command to dispatch

**Returns:** `Promise<void>` - Resolves when the command is handled

**Example:**

```typescript
const command = new CreateTodoCommand({ text: "Learn xndr" });
await commandBus.dispatch(command);
```

## Interface

```typescript
interface CommandBusInterface {
  dispatch<TCommand extends UntypedCommandType>(command: TCommand): Promise<void>;

  register<TCommand extends UntypedCommandType>(handler: CommandHandlerInterface<TCommand>): void;
}
```
