/**
 * Emit per-datasource context/config types and per-query `create*DataSources`
 * factories from checked `datasource` IR. Adapts app `load` / `batchSize` /
 * `concurrency` onto `defineDataSourceFor` (one datasource = one scheduler lane).
 *
 * Each query gets its own factory typed on that query's execution context and
 * including only datasources whose routes intersect resources the query
 * references — matching checker coverage rules (no global `createDataSources`).
 *
 * DSL `when` becomes a single runtime predicate; when every route omits `when`,
 * the config type may supply an implementation `when` instead.
 */
import { queryReferencedResources } from "../../../check/check-datasources";
import type { DatasourceDefinition, FieldDecl, Program, QueryDefinition } from "../../../ir";
import { resolvedQueryContext } from "../../../ir";
import { printTypeExpr } from "../resources";
import {
  ariFactoryName,
  dataSourcesFactoryName,
  datasourceConfigTypeName,
  datasourceContextTypeName,
  executionContextTypeName,
  payloadTypeName,
  resourceTypeName,
  ZIEL_EXECUTION_CONTEXT_TYPE_NAME,
} from "../naming";
import { datasourceExprScope, emitExpr } from "../shared";

function emitObjectTypeAlias(name: string, fields: FieldDecl[], exported: boolean): string {
  const prefix = exported ? "export type" : "type";
  if (fields.length === 0) {
    return `${prefix} ${name} = unknown;`;
  }
  const body = printTypeExpr({ kind: "object", fields, span: null });
  return `${prefix} ${name} = ${body};`;
}

/** First-wins merge of context fields across datasources (checker ensures compatibility). */
function mergeAggregateContextFields(program: Program): FieldDecl[] {
  const seen = new Set<string>();
  const fields: FieldDecl[] = [];
  for (const ds of program.datasources) {
    for (const field of ds.contextFields) {
      if (seen.has(field.name)) {
        continue;
      }
      seen.add(field.name);
      fields.push(field);
    }
  }
  return fields;
}

function hasAnyDslWhen(ds: DatasourceDefinition): boolean {
  return ds.routes.some((route) => route.when !== null);
}

function allowsImplWhen(ds: DatasourceDefinition): boolean {
  return ds.routes.length > 0 && !hasAnyDslWhen(ds);
}

function resourceUnionType(resourceNames: readonly string[]): string {
  if (resourceNames.length === 0) {
    return "never";
  }
  if (resourceNames.length === 1) {
    return resourceTypeName(resourceNames[0]!);
  }
  return resourceNames.map((name) => resourceTypeName(name)).join(" | ");
}

function payloadUnionType(resourceNames: readonly string[]): string {
  if (resourceNames.length === 0) {
    return "undefined";
  }
  const payloads = resourceNames.map((name) => payloadTypeName(name)).join(" | ");
  return `${payloads} | undefined`;
}

function emitDatasourceConfigType(ds: DatasourceDefinition): string {
  const configName = datasourceConfigTypeName(ds.name);
  const contextName = datasourceContextTypeName(ds.name);
  const resourceNames = ds.routes.map((r) => r.resource);
  const batchType = resourceUnionType(resourceNames);
  const payloadType = payloadUnionType(resourceNames);

  const fields: string[] = [
    `  load: (`,
    `    batch: readonly (${batchType})[],`,
    `    context: ResourceLoadContext<${contextName}>`,
    `  ) => Promise<readonly (${payloadType})[]>;`,
    `  batchSize?: number;`,
    `  concurrency?: number;`,
  ];

  if (allowsImplWhen(ds)) {
    fields.push(`  when?: (context: SourceRouteContext<${contextName}>) => boolean;`);
  }

  return `type ${configName} = {\n${fields.join("\n")}\n};`;
}

function emitDslWhenPredicate(ds: DatasourceDefinition): string {
  const lines: string[] = [`      when: ({ executionContext, resource }) => {`];

  for (const route of ds.routes) {
    const ari = ariFactoryName(route.resource);
    if (route.when === null) {
      lines.push(`        if (${ari}.matches(resource)) {`);
      lines.push(`          return true;`);
      lines.push(`        }`);
    } else {
      const pred = emitExpr(route.when, datasourceExprScope);
      lines.push(`        if (${ari}.matches(resource)) {`);
      lines.push(`          return ${pred};`);
      lines.push(`        }`);
    }
  }

  lines.push(`        return false;`);
  lines.push(`      },`);
  return lines.join("\n");
}

function emitDatasourceDefinition(ds: DatasourceDefinition, configAccess: string): string {
  const ariList = ds.routes.map((r) => ariFactoryName(r.resource)).join(", ");
  const resourceNames = ds.routes.map((r) => r.resource);
  const batchCast = `readonly (${resourceUnionType(resourceNames)})[]`;

  const lines: string[] = [
    `    defineSource({`,
    `      id: ${JSON.stringify(ds.name)},`,
    `      for: [${ariList}],`,
    `      batchSize: ${configAccess}.batchSize,`,
    `      concurrency: ${configAccess}.concurrency,`,
  ];

  if (hasAnyDslWhen(ds)) {
    lines.push(emitDslWhenPredicate(ds));
  } else if (allowsImplWhen(ds)) {
    lines.push(`      when: ${configAccess}.when,`);
  }

  lines.push(
    `      load: (batch, ctx) =>`,
    `        ${configAccess}.load(batch as ${batchCast}, {`,
    `          ...ctx,`,
    `          executionContext: ctx.executionContext,`,
    `        }),`,
    `    })`
  );

  return lines.join("\n");
}

/** Datasources whose routes intersect resources referenced by `query` (program order). */
export function datasourcesForQuery(
  query: QueryDefinition,
  datasources: readonly DatasourceDefinition[]
): DatasourceDefinition[] {
  const referenced = queryReferencedResources(query);
  return datasources.filter((ds) => ds.routes.some((route) => referenced.has(route.resource)));
}

/**
 * Per-datasource context types, aggregate `ZielExecutionContext`, and config types.
 * Empty when the program has no datasources.
 */
export function emitDataSourceTypes(program: Program): string {
  if (program.datasources.length === 0) {
    return "";
  }

  const parts: string[] = [];

  for (const ds of program.datasources) {
    parts.push(
      emitObjectTypeAlias(datasourceContextTypeName(ds.name), ds.contextFields, /* exported */ true)
    );
  }

  const aggregateFields = mergeAggregateContextFields(program);
  parts.push(
    emitObjectTypeAlias(ZIEL_EXECUTION_CONTEXT_TYPE_NAME, aggregateFields, /* exported */ true)
  );

  for (const ds of program.datasources) {
    parts.push(emitDatasourceConfigType(ds));
  }

  return parts.join("\n\n");
}

function emitQueryDataSourcesFactory(
  query: QueryDefinition,
  datasources: readonly DatasourceDefinition[],
  registryTypeName: string
): string {
  const covered = datasourcesForQuery(query, datasources);
  const factory = dataSourcesFactoryName(query.name);
  const contextType =
    query.contextProjections.length > 0 ? executionContextTypeName(query.name) : "unknown";

  const configFields = covered
    .map((ds) => `    ${ds.name}: ${datasourceConfigTypeName(ds.name)};`)
    .join("\n");

  const sourceDefs =
    covered.length === 0
      ? ""
      : covered.map((ds) => emitDatasourceDefinition(ds, `config.${ds.name}`)).join(",\n");

  return [
    `export function ${factory}(`,
    `  config: {`,
    configFields,
    `  }`,
    `): DataSource<${registryTypeName}, ${contextType}>[] {`,
    `  const defineSource = defineDataSourceFor<${registryTypeName}, ${contextType}>();`,
    ``,
    `  return [`,
    sourceDefs,
    `  ];`,
    `}`,
  ].join("\n");
}

/**
 * Emit `create{Query}DataSources` for each query. Empty when there are no
 * datasources or no queries.
 *
 * Callers that also emit strategies must place this **after** strategy emission
 * so `{Query}ExecutionContext` aliases exist.
 *
 * @param emitQueryContexts - When true (standalone `generateDataSources`), also
 *   emit `{Query}ExecutionContext` aliases before factories. Compose leaves this
 *   false because strategies already emit those types.
 */
export function emitQueryDataSourceFactories(
  program: Program,
  registryTypeName = "ContentRegistry",
  options: { emitQueryContexts?: boolean } = {}
): string {
  if (program.datasources.length === 0 || program.queries.length === 0) {
    return "";
  }

  const emitQueryContexts = options.emitQueryContexts ?? false;
  const parts: string[] = [];

  for (const query of program.queries) {
    if (emitQueryContexts && query.contextProjections.length > 0) {
      parts.push(
        emitObjectTypeAlias(
          executionContextTypeName(query.name),
          resolvedQueryContext(query),
          /* exported */ true
        )
      );
    }
    parts.push(emitQueryDataSourcesFactory(query, program.datasources, registryTypeName));
  }

  return parts.join("\n\n");
}

/**
 * Full datasource section for standalone `generateDataSources`: types + per-query
 * factories (with query execution-context aliases).
 */
export function emitDataSources(program: Program, registryTypeName = "ContentRegistry"): string {
  const types = emitDataSourceTypes(program);
  if (types.length === 0) {
    return "";
  }

  const factories = emitQueryDataSourceFactories(program, registryTypeName, {
    emitQueryContexts: true,
  });

  return factories.length > 0 ? `${types}\n\n${factories}` : types;
}

/** True when any datasource may accept an implementation `when` on its config. */
export function datasourcesNeedSourceRouteContext(program: Program): boolean {
  return program.datasources.some(allowsImplWhen);
}
