# Gordio architecture graph analysis

`@xndrjs/gordio` is a proposed package for representing architecture graphs with React Flow.

The target use case is a visual map of a codebase where apps, core packages, and infrastructure packages are arranged in macro-columns, each package is rendered as a box, and architectural elements inside those boxes are rendered as graph nodes connected by semantic edges.

This document is analysis only. It should guide the first package design without committing the public API too early.

## Core idea

Gordio should keep three concerns separate:

- Graph document model: boxes, nodes, edges, ids, metadata, and semantic relationships.
- View schema: macro-columns, box kinds, slots inside boxes, rendering hints, and collapse defaults.
- Discovery pipeline: file matchers and parser callbacks that inspect a consuming codebase and return graph fragments.

React Flow should be the rendering target, not the domain model. The graph should remain serializable and testable without React.

## Default architecture view

The first useful preset is a three-column map:

```text
[ apps ]  [ core ]  [ infrastructure ]
```

The `apps` column contains one box per app. Each app box contains composition root nodes.

The `core` column contains one box per core package. Each core box contains four inner slots:

```text
[ models ] [ operations ] [ use-cases ] [ ports ]
```

The `infrastructure` column contains one box per infrastructure package. Each infrastructure box contains two inner slots:

```text
[ adapters or repositories ] [ loaders ]
```

This structure should be a default preset, not hardcoded behavior. A consuming project should be able to declare different macro-columns, different box kinds, and different inner slots.

## Graph model

The semantic graph can stay intentionally generic:

```ts
type ArchitectureId = string;

type ArchitectureGraph = {
  boxes: ArchitectureBox[];
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
};

type ArchitectureBox = {
  id: ArchitectureId;
  kind: string;
  title: string;
  laneId: string;
  packageName?: string;
  metadata?: Record<string, unknown>;
};

type ArchitectureNode = {
  id: ArchitectureId;
  kind: string;
  title: string;
  boxId: ArchitectureId;
  slot?: string;
  type?: string;
  data?: Record<string, unknown>;
};

type ArchitectureEdge = {
  sourceId: ArchitectureId;
  targetId: ArchitectureId;
  kind?: string;
  directed?: boolean;
  metadata?: Record<string, unknown>;
};
```

`kind` identifies the graph category. `type` remains available as a domain-specific display label when a project needs an additional label beyond the node kind.

## Default node categories

### Models

Models need a name and a model type.

```ts
type ModelNodeData = {
  modelType: string;
};
```

The model type intentionally stays simple for the first version. Values such as `object`, `string`, `number`, `boolean`, `bigint`, and `symbol` can be treated as conventions, while projects can still introduce their own labels. An object model may be an entity or aggregate; a string model may be a value object. Gordio should not force that terminology.

### Operations

Operations need a name. In the default xndrjs preset, `capability` and `service` are concrete node kinds that live in the `operations` slot.

```ts
type OperationNodeData = Record<string, never>;
```

Projects can still define additional operation-like node kinds in their own schema.

### Use cases

Use cases only need the name.

```ts
type UseCaseNodeData = Record<string, never>;
```

### Ports

Ports need a name and a method list.

```ts
type PortNodeData = {
  methods: Array<{
    name: string;
    args?: Array<{
      name: string;
      type: string;
    }>;
    returns?: string;
  }>;
};
```

Example:

```ts
const cmsPortNode = {
  id: "core:content:CmsPort",
  kind: "port",
  title: "CmsPort",
  boxId: "pkg:core-content",
  slot: "ports",
  data: {
    methods: [{ name: "getEntryById", args: [{ name: "id", type: "string" }] }],
  },
};
```

## Declarative view schema

The view schema describes the layout grammar. It should be serializable and independent from graph data.

```ts
type ArchitectureViewSchema = {
  lanes: LaneDefinition[];
  boxKinds: BoxKindDefinition[];
  nodeKinds: NodeKindDefinition[];
};

type LaneDefinition = {
  id: string;
  title: string;
  order: number;
};

type BoxKindDefinition = {
  id: string;
  laneId: string;
  slots: SlotDefinition[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
};

type SlotDefinition = {
  id: string;
  title: string;
  order: number;
  accepts?: string[];
};

type NodeKindDefinition = {
  id: string;
  defaultSlot?: string;
  renderAs?: "compact" | "card" | "signature" | string;
};
```

The default clean architecture preset can be expressed as:

```ts
const cleanArchitecturePreset = {
  lanes: [
    { id: "apps", title: "Apps", order: 1 },
    { id: "core", title: "Core", order: 2 },
    { id: "infrastructure", title: "Infrastructure", order: 3 },
  ],
  boxKinds: [
    {
      id: "app",
      laneId: "apps",
      slots: [{ id: "composition-roots", title: "Composition roots", order: 1 }],
    },
    {
      id: "core-package",
      laneId: "core",
      collapsible: true,
      slots: [
        { id: "models", title: "Models", order: 1, accepts: ["model"] },
        { id: "operations", title: "Operations", order: 2, accepts: ["capability", "service"] },
        { id: "use-cases", title: "Use cases", order: 3, accepts: ["use-case"] },
        { id: "ports", title: "Ports", order: 4, accepts: ["port"] },
      ],
    },
    {
      id: "infrastructure-package",
      laneId: "infrastructure",
      collapsible: true,
      slots: [
        {
          id: "adapters",
          title: "Adapters / repositories",
          order: 1,
          accepts: ["adapter", "repository"],
        },
        { id: "loaders", title: "Loaders", order: 2, accepts: ["loader"] },
      ],
    },
  ],
  nodeKinds: [
    { id: "composition-root", defaultSlot: "composition-roots" },
    { id: "model", defaultSlot: "models" },
    { id: "capability", defaultSlot: "operations" },
    { id: "service", defaultSlot: "operations" },
    { id: "use-case", defaultSlot: "use-cases" },
    { id: "port", defaultSlot: "ports", renderAs: "signature" },
    { id: "adapter", defaultSlot: "adapters" },
    { id: "repository", defaultSlot: "adapters" },
    { id: "loader", defaultSlot: "loaders" },
  ],
};
```

Validation should happen before rendering:

- every box references an existing lane;
- every node references an existing box;
- every node slot exists in the referenced box kind;
- every edge endpoint references either a node or a box;
- duplicate box and node ids are rejected or merged before React Flow conversion;
- duplicate edge relationships are merged before React Flow conversion.

## React Flow projection

React Flow should receive a projection of the semantic graph:

```ts
type ReactFlowProjection = {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
};

function toReactFlowGraph(input: {
  graph: ArchitectureGraph;
  schema: ArchitectureViewSchema;
  viewState: ArchitectureViewState;
}): ReactFlowProjection;
```

Recommended mapping:

- lane headers are visual layout containers, not semantic graph entities;
- boxes become React Flow parent nodes;
- inner nodes become child nodes with `parentId`;
- slots are rendered by the box node component;
- edges between visible child nodes connect directly to those children;
- edges involving collapsed boxes are rerouted to the visible box shell.

This keeps architecture data independent from React Flow internals.

## Layout strategy

The first implementation should prefer deterministic column layout over a general graph layout engine.

Suggested phases:

1. Group boxes by lane.
2. Sort lanes by schema order.
3. Sort boxes inside each lane by title or explicit metadata order.
4. Inside each box, group nodes by slot.
5. Sort nodes by title.
6. Compute box size from visible slot content.
7. Place boxes vertically within each lane.
8. Convert semantic edges to visible React Flow edges after collapse state is known.

This optimizes for architectural readability. The user's mental model is columnar architecture first, graph topology second.

## Visual states and policies

Visual state should use three values:

```ts
type VisualState = "normal" | "highlighted" | "muted";

type EdgeKey = string;
```

Policies should be pure functions over graph, schema, current state, and interaction:

```ts
type DecorationPatch = {
  boxes?: Record<ArchitectureId, VisualState>;
  nodes?: Record<ArchitectureId, VisualState>;
  edges?: Record<EdgeKey, VisualState>;
};

type ArchitecturePolicy = (input: {
  graph: ArchitectureGraph;
  schema: ArchitectureViewSchema;
  viewState: ArchitectureViewState;
  event: ArchitectureInteraction;
}) => DecorationPatch;
```

### Direct neighbour policy

When the user clicks a node:

- highlight the selected node;
- highlight directly connected nodes;
- highlight directly connected edges;
- mute unrelated boxes, nodes, and edges;
- keep boxes containing highlighted nodes visible.

This policy can treat edges as undirected for exploration, even when the underlying relationship is directed.

### Composition reachability policy

When the user clicks a composition root:

- compute all nodes and boxes reachable from the composition root;
- keep reachable app, core, and infrastructure boxes visible and expanded;
- mute non-reachable graph elements;
- collapse non-app boxes that are not reachable;
- highlight the composition root and the reachable path edges.

Reachability should be configurable:

```ts
type ReachabilityMode = "directed" | "undirected" | "downstream" | "upstream";
```

For clean architecture diagrams, `downstream` is likely the useful default: composition root to use case, use case to ports and operations, port to infrastructure adapter, and so on.

## Collapse state

Collapse should be separate from visual state.

```ts
type ArchitectureViewState = {
  selectedId?: ArchitectureId;
  collapsedBoxes: Record<ArchitectureId, boolean>;
  visual: {
    boxes: Record<ArchitectureId, VisualState>;
    nodes: Record<ArchitectureId, VisualState>;
    edges: Record<EdgeKey, VisualState>;
  };
};
```

Rules:

- app boxes default to expanded;
- core and infrastructure boxes can default to collapsed in large graphs;
- clicking a box toggles that box only;
- clicking a composition root applies reachability-driven expansion;
- manual user toggles should be preserved until a new selection policy resets them.

Collapsed boxes should still show title, package name, hidden node counts by slot, edge indicators, and highlighted state if any hidden child is highlighted.

## Edge semantics

Edges should represent architecture relationships, not just visual links. The default relationship should be read as:

```text
source uses target
```

`kind` should stay optional. Most edges should not need a visible label, because labels can quickly add visual noise and make large graphs harder to scan.

When a project needs a more specific relationship, it can still provide one through `kind`. Examples might include `implements`, `loads`, `composes`, or `uses-model`, but these should be annotations rather than required categories. If two edges connect the same endpoints with different `kind` values, they represent different relationships and should not be deduplicated together.

## Discovery pipeline

Gordio should provide Node-side functions that scan the consuming codebase, match files, and call parser callbacks. Each callback returns a graph fragment.

```ts
type FileMatcher = {
  id: string;
  include: string | string[];
  exclude?: string | string[];
  parse: (file: MatchedFile, context: DiscoveryContext) => Promise<GraphFragment> | GraphFragment;
};

type MatchedFile = {
  path: string;
  content: string;
};

type GraphFragment = {
  boxes?: ArchitectureBox[];
  nodes?: ArchitectureNode[];
  edges?: ArchitectureEdge[];
};

type DiscoveryContext = {
  rootDir: string;
  createId: (...parts: string[]) => ArchitectureId;
  readJson: <T = unknown>(path: string) => Promise<T>;
};
```

Scanner API:

```ts
async function discoverArchitectureGraph(options: {
  rootDir: string;
  matchers: FileMatcher[];
  dedupe?: DedupeStrategy;
}): Promise<ArchitectureGraph>;
```

Parsers remain project-specific. The package coordinates file discovery, fragment collection, validation, and deduplication. Different projects can mix regex, TypeScript AST, `ts-morph`, JSON metadata, or custom conventions.

Example matcher:

```ts
const compositionRootMatcher = {
  id: "composition-roots",
  include: ["apps/*/src/**/composition*.ts", "apps/*/src/**/container*.ts"],
  parse(file, context) {
    const appName = inferAppName(file.path);
    const boxId = context.createId("app", appName);
    const nodeId = context.createId("composition-root", appName, file.path);

    return {
      boxes: [{ id: boxId, kind: "app", laneId: "apps", title: appName }],
      nodes: [{ id: nodeId, kind: "composition-root", title: basename(file.path), boxId }],
    };
  },
} satisfies FileMatcher;
```

## Deduplication

Automatic deduplication is important because different matchers may discover the same architectural element.

The package should support:

- identity dedupe by `id`;
- semantic dedupe by stable keys.
- edge dedupe by relationship, using a key derived from source, target, direction, and optional kind.

```ts
type DedupeStrategy = {
  boxKey?: (box: ArchitectureBox) => string;
  nodeKey?: (node: ArchitectureNode) => string;
  edgeKey?: (edge: ArchitectureEdge) => EdgeKey;
  mergeBox?: (current: ArchitectureBox, next: ArchitectureBox) => ArchitectureBox;
  mergeNode?: (current: ArchitectureNode, next: ArchitectureNode) => ArchitectureNode;
  mergeEdge?: (current: ArchitectureEdge, next: ArchitectureEdge) => ArchitectureEdge;
};
```

Default keys:

```ts
function createEdgeKey(edge: ArchitectureEdge): EdgeKey {
  const endpoints = edge.directed
    ? [edge.sourceId, edge.targetId]
    : [edge.sourceId, edge.targetId].sort();

  return [...endpoints, edge.kind ?? ""].join(":");
}

const defaultDedupe = {
  boxKey: (box) => box.id,
  nodeKey: (node) => node.id,
  edgeKey: createEdgeKey,
};
```

Directed edges preserve source and target order. Non-directed edges represent symmetric relationships, so their endpoints are sorted before building the key. `kind` participates in the key when present, allowing multiple semantic relationships between the same endpoints. The graph input does not need edge ids; React Flow edge ids should be derived from `createEdgeKey` during projection, so they include source, target, direction, and optional kind consistently with deduplication.

Merge defaults should be conservative:

- preserve the first stable identity;
- merge metadata shallowly;
- merge port methods by method name and argument signature;
- merge edge metadata without creating multiple visual edges for the same semantic relation;
- report conflicts when two fragments define the same id with incompatible kind, box, slot, or lane id.

## Potential package surface

The initial public surface might eventually become:

```ts
export type {
  ArchitectureBox,
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureNode,
  ArchitecturePolicy,
  ArchitectureViewSchema,
  ArchitectureViewState,
  FileMatcher,
  GraphFragment,
};

export { cleanArchitecturePreset } from "./presets/clean-architecture";
export { discoverArchitectureGraph } from "./discovery/discover";
export { mergeGraphFragments } from "./graph/merge";
export { validateArchitectureGraph } from "./graph/validate";
export { createArchitectureViewState } from "./view/state";
export { applyArchitecturePolicies } from "./view/policies";
export { toReactFlowGraph } from "./react-flow/project";
export { ArchitectureGraphCanvas } from "./react/ArchitectureGraphCanvas";
```

This is not a commitment yet. It suggests useful boundaries.

## Package split question

The alpha should start as a single package:

```text
@xndrjs/gordio
```

It should expose a `gordio dev` command that runs discovery, merges the resulting graph document, and serves a local React Flow viewer in the browser.

The viewer app can be bundled inside the published package and served by the CLI from `node_modules/@xndrjs/gordio`. Users should interact with it through a local URL, not by opening files inside `node_modules`.

```text
consumer codebase
  -> gordio dev
  -> discovery + merge
  -> architecture graph document
  -> local viewer server
  -> browser
```

A later split can still happen if the boundaries become useful:

- `@xndrjs/gordio` for graph core, discovery, validation, merge, and CLI;
- `@xndrjs/gordio-react` or `@xndrjs/gordio-viewer` for React Flow projection and UI components.

For the alpha, a single package is simpler and keeps the feedback loop short.

The first real consumer integration should be tested against:

```text
~/Develop/xndrjs-monorepo
```

That test should use a local package tarball produced from `packages/gordio` with `npm pack`, then install that tarball in the consumer monorepo. This keeps the integration close to how a published package will behave and avoids relying on workspace-only imports.

## Suggested phases

Phase 1: graph core.

- Define graph types, schema types, validation, merge, and dedupe.
- Test invalid references, duplicate conflicts, and edge endpoint validation.

Phase 2: discovery and CLI.

- Implement glob scanning.
- Add parser callback contracts.
- Merge graph fragments.
- Test multiple matchers returning overlapping graph elements.
- Add `gordio dev` as the alpha entry point.

Phase 3: local viewer.

- Convert boxes and nodes to React Flow nodes.
- Convert semantic edges to visible edges.
- Support collapsed boxes and edge rerouting.
- Serve the bundled viewer from `gordio dev`.

Phase 4: interaction policies.

- Add direct neighbour highlighting.
- Add composition reachability highlighting.
- Add collapse expansion rules.
- Keep policy functions pure and testable without React.

Phase 5: UI components.

- Provide default box, node, port signature, edge, and legend components.
- Allow consumers to override renderers by kind.
- Add a real integration demo on `~/Develop/xndrjs-monorepo` by installing a locally packed `@xndrjs/gordio` tarball.

## Open decisions

- Whether edge exploration should treat relationships as directed or undirected by default.
- Whether deterministic column layout is enough for v0.
- Whether TypeScript AST helpers belong in the package or in user callbacks.
- Whether to publish a JSON schema for persisted graph documents.
- When to split the viewer into a separate package, if at all.

## Recommendation

Start with a single alpha package that includes a framework-neutral graph core, a declarative view schema, discovery, and a `gordio dev` command that serves a bundled React Flow viewer.

The key abstraction is the view schema: it lets Gordio express apps, core packages, infrastructure packages, and inner slots without hardcoding that taxonomy.

The second key abstraction is pure policies: highlighting, muting, reachability, and collapse decisions can be tested independently from React Flow and reused by future renderers.
