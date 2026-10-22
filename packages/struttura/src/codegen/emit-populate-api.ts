import { createHash } from "node:crypto";

import type { ArtifactDescriptor } from "../architecture/artifacts";
import type {
  AnyConstructDefinition,
  Architecture,
  InstanceArtifacts,
  InstanceRef,
} from "../architecture/define-architecture";

export type ArtifactKind = "directory" | "file";

/** Nested navigable children (tree constructs); keys are authoring property names. */
export type NavigableChildShape =
  | { readonly kind: "file" }
  | {
      readonly kind: "directory";
      readonly children: Readonly<Record<string, NavigableChildShape>>;
    };

/**
 * Sealed instance root shape for tree constructs.
 * `peer` and `directory` both type as DirRef + children; `file` as FileRef.
 */
export type NavigableRootShape =
  | { readonly root: "file" }
  | {
      readonly root: "directory" | "peer";
      readonly children: Readonly<Record<string, NavigableChildShape>>;
    };

export type EmitPopulateApiOptions = {
  /** Module specifier imported by the generated file (e.g. `"../architecture"`). */
  readonly architectureModule: string;
  /** Named export for the sealed Architecture (default `"architecture"`). */
  readonly architectureExport?: string;
  /**
   * Named export for a `Record<constructName, AnyConstructDefinition>`
   * (default `"constructs"`).
   */
  readonly constructsExport?: string;
  /** Import path for `@xndrjs/struttura` (default `"@xndrjs/struttura"`). */
  readonly strutturaPackage?: string;
};

export type EmitPopulateApiResult = {
  readonly source: string;
  readonly stamp: string;
};

/**
 * Stable hash of construct names, authoring, dependency contracts, and probed
 * artifact keys/kinds. Embedded in the generated populate API (ADR 0010).
 */
export function computeDefinitionStamp(architecture: Architecture): string {
  const kindsByConstruct = probeArtifactKinds(architecture);
  const payload = {
    name: architecture.name,
    constructs: sortedConstructNames(architecture).map((name) => {
      const construct = architecture.constructs.get(name)!;
      const dependencies: Record<string, string> = {};
      for (const key of Object.keys(construct.dependencies).sort()) {
        dependencies[key] = construct.dependencies[key]!.name;
      }
      const kinds = kindsByConstruct.get(name) ?? {};
      const artifacts: Record<string, ArtifactKind> = {};
      for (const key of Object.keys(kinds).sort()) {
        artifacts[key] = kinds[key]!;
      }
      return {
        name,
        authoring: construct.authoring,
        dependencies,
        artifacts,
      };
    }),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Discover artifact keys and Dir vs File kinds by probing each construct's
 * artifacts callback in dependency order (analysis §5 — no second manual list).
 * Tree deps are stubbed as navigable DirRef/FileRef roots so `A.in(dep, …)` works.
 */
export function probeArtifactKinds(
  architecture: Architecture
): ReadonlyMap<string, Readonly<Record<string, ArtifactKind>>> {
  const kinds = new Map<string, Record<string, ArtifactKind>>();
  for (const name of topologicalConstructNames(architecture)) {
    const construct = architecture.constructs.get(name)!;
    const stubDeps: Record<string, InstanceRef> = {};
    for (const [depKey, depConstruct] of Object.entries(construct.dependencies)) {
      stubDeps[depKey] = stubDependencyInstance(depConstruct, kinds.get(depConstruct.name) ?? {});
    }

    const descriptors = construct.buildArtifacts({
      name: "__probe__",
      id: "__probe__",
      ...stubDeps,
    }) as Record<string, ArtifactDescriptor>;

    const constructKinds: Record<string, ArtifactKind> = {};
    for (const [artifactKey, descriptor] of Object.entries(descriptors)) {
      constructKinds[artifactKey] = descriptor.kind === "dir-descriptor" ? "directory" : "file";
    }
    kinds.set(name, constructKinds);
  }
  return kinds;
}

/**
 * Derive navigable root shapes for tree constructs from probed artifact kinds.
 * Flat constructs are omitted (legacy `.artifacts` path).
 */
export function probeNavigableShapes(
  architecture: Architecture
): ReadonlyMap<string, NavigableRootShape> {
  const kinds = probeArtifactKinds(architecture);
  const shapes = new Map<string, NavigableRootShape>();
  for (const name of sortedConstructNames(architecture)) {
    const construct = architecture.constructs.get(name)!;
    if (construct.authoring !== "tree") {
      continue;
    }
    shapes.set(name, navigableShapeFromKinds(kinds.get(name) ?? {}));
  }
  return shapes;
}

export function navigableShapeFromKinds(
  kinds: Readonly<Record<string, ArtifactKind>>
): NavigableRootShape {
  if (kinds["."] === "file") {
    return { root: "file" };
  }
  const children = nestChildrenFromKinds(kinds);
  if (kinds["."] === "directory") {
    return { root: "directory", children };
  }
  return { root: "peer", children };
}

export function constructsFromArchitecture(
  architecture: Architecture
): Record<string, AnyConstructDefinition> {
  return Object.fromEntries(architecture.constructs.entries());
}

/**
 * Emit TypeScript source for the typed populate API. Does not write the
 * filesystem — callers (and the wave-1 `codegen` CLI) decide destination.
 *
 * Tree constructs get navigable refs (no `.artifacts`); flat constructs keep
 * the legacy `artifacts` map until demo migration (ticket 05 / 06).
 */
export function emitPopulateApi(
  architecture: Architecture,
  options: EmitPopulateApiOptions
): EmitPopulateApiResult {
  const stamp = computeDefinitionStamp(architecture);
  const kinds = probeArtifactKinds(architecture);
  const shapes = probeNavigableShapes(architecture);
  const architectureExport = options.architectureExport ?? "architecture";
  const constructsExport = options.constructsExport ?? "constructs";
  const strutturaPackage = options.strutturaPackage ?? "@xndrjs/struttura";
  const constructNames = sortedConstructNames(architecture);

  const lines: string[] = [
    "/** @generated by @xndrjs/struttura — do not edit by hand */",
    `import {`,
    `  createPopulation,`,
    `  type DirRef,`,
    `  type FileRef,`,
    `  type InstanceRef,`,
    `  type Population,`,
    `} from "${strutturaPackage}";`,
    `import { ${architectureExport}, ${constructsExport} } from "${options.architectureModule}";`,
    "",
    `export const DEFINITION_STAMP = "${stamp}";`,
    "",
  ];

  for (const name of constructNames) {
    const construct = architecture.constructs.get(name)!;
    if (construct.authoring === "tree") {
      emitTreeConstructTypes(lines, name, shapes.get(name) ?? { root: "peer", children: {} });
    } else {
      emitFlatConstructTypes(lines, name, kinds.get(name) ?? {});
    }
  }

  lines.push(`export type ${safeTypeName(architecture.name)}PopulateApi = {`);
  lines.push(`  readonly population: Population;`);
  for (const name of constructNames) {
    lines.push(`  ${name}(input: ${factoryInputType(architecture, name)}): ${name}Ref;`);
  }
  lines.push(`};`, "");

  lines.push(
    `export function createPopulateApi(): ${safeTypeName(architecture.name)}PopulateApi {`
  );
  lines.push(
    `  const population = createPopulation(${architectureExport}, { definitionStamp: DEFINITION_STAMP });`
  );
  lines.push(`  return {`);
  lines.push(`    get population() {`);
  lines.push(`      return population;`);
  lines.push(`    },`);
  for (const name of constructNames) {
    lines.push(`    ${name}(input) {`);
    lines.push(`      return population.add(${constructsExport}.${name}, input) as ${name}Ref;`);
    lines.push(`    },`);
  }
  lines.push(`  };`);
  lines.push(`}`);
  lines.push("");

  return { source: lines.join("\n"), stamp };
}

function emitFlatConstructTypes(
  lines: string[],
  name: string,
  artifactKinds: Readonly<Record<string, ArtifactKind>>
): void {
  const artifactKeys = Object.keys(artifactKinds).sort();
  lines.push(`export type ${name}Artifacts = {`);
  for (const key of artifactKeys) {
    const refType = artifactKinds[key] === "directory" ? "DirRef" : "FileRef";
    lines.push(`  readonly ${key}: ${refType};`);
  }
  lines.push(`};`, "");
  lines.push(
    `export type ${name}Ref = InstanceRef & {`,
    `  readonly __constructBrand: "${name}";`,
    `  readonly artifacts: ${name}Artifacts;`,
    `};`,
    ""
  );
}

function emitTreeConstructTypes(lines: string[], name: string, shape: NavigableRootShape): void {
  if (shape.root === "file") {
    lines.push(
      `export type ${name}Ref = Omit<InstanceRef, "artifacts"> & FileRef & {`,
      `  readonly __constructBrand: "${name}";`,
      `};`,
      ""
    );
    return;
  }

  const childEntries = Object.entries(shape.children);
  if (childEntries.length === 0) {
    lines.push(
      `export type ${name}Ref = Omit<InstanceRef, "artifacts"> & DirRef & {`,
      `  readonly __constructBrand: "${name}";`,
      `};`,
      ""
    );
    return;
  }

  lines.push(`export type ${name}Ref = Omit<InstanceRef, "artifacts"> & DirRef & {`);
  lines.push(`  readonly __constructBrand: "${name}";`);
  for (const [key, child] of childEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    lines.push(`  readonly ${key}: ${navigableChildType(child)};`);
  }
  lines.push(`};`, "");
}

function navigableChildType(shape: NavigableChildShape): string {
  if (shape.kind === "file") {
    return "FileRef";
  }
  const childEntries = Object.entries(shape.children);
  if (childEntries.length === 0) {
    return "DirRef";
  }
  const parts = childEntries
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, child]) => `readonly ${key}: ${navigableChildType(child)}`);
  return `DirRef & { ${parts.join("; ")} }`;
}

function nestChildrenFromKinds(
  kinds: Readonly<Record<string, ArtifactKind>>
): Record<string, NavigableChildShape> {
  const root: Record<string, NavigableChildShape> = {};
  const keys = Object.keys(kinds)
    .filter((key) => key !== ".")
    .sort((a, b) => {
      const depth = a.split(".").length - b.split(".").length;
      return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
    });

  for (const key of keys) {
    const parts = key.split(".");
    let cursor: Record<string, NavigableChildShape> = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        const kind = kinds[key]!;
        if (kind === "file") {
          cursor[part] = { kind: "file" };
        } else {
          const existing = cursor[part];
          cursor[part] =
            existing && existing.kind === "directory"
              ? existing
              : { kind: "directory", children: {} };
        }
        continue;
      }
      const existing = cursor[part];
      if (!existing || existing.kind !== "directory") {
        cursor[part] = { kind: "directory", children: {} };
      }
      cursor = (
        cursor[part] as { kind: "directory"; children: Record<string, NavigableChildShape> }
      ).children;
    }
  }

  return root;
}

function stubDependencyInstance(
  depConstruct: AnyConstructDefinition,
  depKinds: Readonly<Record<string, ArtifactKind>>
): InstanceRef {
  const artifacts: InstanceArtifacts = {};
  for (const [artifactKey, kind] of Object.entries(depKinds)) {
    artifacts[artifactKey] =
      kind === "directory"
        ? {
            kind: "directory",
            path: `__probe__/${artifactKey}`,
            instanceId: "__probe__",
            artifactKey,
          }
        : {
            kind: "file",
            path: `__probe__/${artifactKey}`,
            instanceId: "__probe__",
            artifactKey,
            mode: "sync",
            filename: artifactKey,
          };
  }

  const stub: Record<string, unknown> = {
    id: "__probe__",
    name: "__probe__",
    construct: depConstruct,
    dependencies: {},
    artifacts,
  };

  if (depConstruct.authoring === "tree") {
    Object.assign(stub, navigableProbeFields(depKinds, depConstruct.name));
  }

  return stub as InstanceRef;
}

/** Runtime fields so tree builders can use the stub as `A.in` destination / child DirRef. */
function navigableProbeFields(
  kinds: Readonly<Record<string, ArtifactKind>>,
  constructName: string
): Record<string, unknown> {
  const basePath = `__probe__/${constructName}`;

  if (kinds["."] === "file") {
    return {
      kind: "file",
      path: basePath,
      instanceId: "__probe__",
      artifactKey: ".",
      mode: "sync",
      filename: "probe.ts",
    };
  }

  const fields: Record<string, unknown> = {
    kind: "directory",
    path: kinds["."] === "directory" ? basePath : "",
    instanceId: "__probe__",
    artifactKey: ".",
  };

  assignNavigableChildren(fields, nestChildrenFromKinds(kinds), basePath);
  return fields;
}

function assignNavigableChildren(
  target: Record<string, unknown>,
  children: Readonly<Record<string, NavigableChildShape>>,
  parentPath: string
): void {
  for (const [key, child] of Object.entries(children)) {
    const childPath = parentPath === "" ? key : `${parentPath}/${key}`;
    if (child.kind === "file") {
      target[key] = {
        kind: "file",
        path: childPath,
        instanceId: "__probe__",
        artifactKey: key,
        mode: "sync",
        filename: key,
      };
      continue;
    }
    const dirNode: Record<string, unknown> = {
      kind: "directory",
      path: childPath,
      instanceId: "__probe__",
      artifactKey: key,
    };
    assignNavigableChildren(dirNode, child.children, childPath);
    target[key] = dirNode;
  }
}

function factoryInputType(architecture: Architecture, constructName: string): string {
  const construct = architecture.constructs.get(constructName)!;
  const parts = ["name: string", "id?: string"];
  for (const key of Object.keys(construct.dependencies).sort()) {
    const dep = construct.dependencies[key]!;
    parts.push(`${key}: ${dep.name}Ref`);
  }
  return `{ ${parts.join("; ")} }`;
}

function safeTypeName(architectureName: string): string {
  const cleaned = architectureName.replace(/[^A-Za-z0-9_]/g, "");
  return cleaned.length > 0 ? cleaned : "Architecture";
}

function sortedConstructNames(architecture: Architecture): string[] {
  return [...architecture.constructs.keys()].sort();
}

function topologicalConstructNames(architecture: Architecture): string[] {
  const remaining = new Set(architecture.constructs.keys());
  const ordered: string[] = [];

  while (remaining.size > 0) {
    let progressed = false;
    for (const name of [...remaining].sort()) {
      const construct = architecture.constructs.get(name)!;
      const depsReady = Object.values(construct.dependencies).every((dep) =>
        ordered.includes(dep.name)
      );
      if (!depsReady) {
        continue;
      }
      ordered.push(name);
      remaining.delete(name);
      progressed = true;
    }
    if (!progressed) {
      // Cycle or missing dep — fall back to remaining sorted names so codegen
      // still emits something; probe may throw for the broken constructs.
      ordered.push(...[...remaining].sort());
      break;
    }
  }
  return ordered;
}
