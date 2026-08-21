# @xndrjs/resource-graph-resolver

Application-layer resource graph resolution: content maps, islands, expansion ports, and a reusable graph engine.

## Installation

```bash
npm install @xndrjs/resource-graph-resolver
```

## Typing resolved content

Projects supply a `ContentRegistry` (ARI `type` → payload) so `ContentMap.get` / `set` follow `ari.type`:

```ts
type AppContentRegistry = {
  page: { title: string };
  asset: { url: string };
};

const engine = new ResolveContentGraphEngine<AppContentRegistry>(dataPort, expansionPort);
const { contentMap } = await engine.execute({
  root: page,
  context: {},
  missingResourceMode: "throw",
});

contentMap.get(page); // { title: string } | undefined
```

`getByKey` and `SerializedIsland.resources` stay weakly typed (opaque `ResourceKey`).
