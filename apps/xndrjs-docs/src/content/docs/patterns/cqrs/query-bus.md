---
title: patterns → cqrs → Query Bus
---

# QueryBus

The `QueryBus` handles queries (read operations) in a CQRS architecture.

## Class Definition

```typescript
class QueryBus implements QueryBusInterface {
  constructor(props?: QueryBusConstructorProps);

  dispatch<TQuery extends UntypedQueryType>(query: TQuery): Promise<QueryResult<TQuery>>;

  register<TQuery extends UntypedQueryType>(handler: QueryHandlerInterface<TQuery>): void;
}
```

## Constructor

### `new QueryBus(props?: QueryBusConstructorProps)`

Creates a new QueryBus instance.

**Parameters:**

- `props?: QueryBusConstructorProps` - Optional configuration
  ```typescript
  interface QueryBusConstructorProps {
    monitoringService?: MonitoringService | null;
  }
  ```

**Example:**

```typescript
const queryBus = new QueryBus();
// or with options
const queryBus = new QueryBus({
  monitoringService: myMonitoringService,
});
```

## Methods

### `register<TQuery>(handler: QueryHandlerInterface<TQuery>): void`

Registers a query handler.

**Type Parameters:**

- `TQuery` - The query type (must extend `UntypedQueryType`)

**Parameters:**

- `handler: QueryHandlerInterface<TQuery>` - The handler function
  ```typescript
  interface QueryHandlerInterface<TQuery extends UntypedQueryType> {
    (query: TQuery): Promise<TQuery["result"]>;
  }
  ```

**Example:**

```typescript
queryBus.register(async (query: GetTodosQuery) => {
  return await todosRepository.findAll();
});
```

### `dispatch<TQuery>(query: TQuery): Promise<QueryResult<TQuery>>`

Dispatches a query to registered handlers and returns the result.

**Type Parameters:**

- `TQuery` - The query type

**Parameters:**

- `query: TQuery` - The query to dispatch

**Returns:** `Promise<QueryResult<TQuery>>` - The query result

**Example:**

```typescript
const query = new GetTodosQuery();
const todos = await queryBus.dispatch(query); // Promise<Todo[]>
```

## Interface

```typescript
interface QueryBusInterface {
  dispatch<TQuery extends UntypedQueryType>(query: TQuery): Promise<QueryResult<TQuery>>;

  register<TQuery extends UntypedQueryType>(handler: QueryHandlerInterface<TQuery>): void;
}

type QueryResult<TQuery> =
  TQuery extends QueryInterface<string, unknown, infer TResult> ? TResult : never;
```
