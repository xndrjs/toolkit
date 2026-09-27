/**
 * Emit `createDataSources` + per-datasource context/config types from checked
 * `datasource` IR. Adapts app `load` / `batchSize` / `concurrency` onto
 * `defineDataSourceFor` (one datasource = one scheduler lane).
 *
 * DSL `when` becomes a single runtime predicate; when every route omits `when`,
 * the config type may supply an implementation `when` instead.
 */
import type { DatasourceDefinition, FieldDecl, Program } from "../../../ir";
import { printTypeExpr } from "../resources";
import {
  ariFactoryName,
  datasourceConfigTypeName,
  datasourceContextTypeName,
  payloadTypeName,
  resourceTypeName,
  ZIEL_EXECUTION_CONTEXT_TYPE_NAME,
} from "../naming";
import { datasourceExprScope, emitExpr } from "../shared";

function emitObjectTypeAlias(name: string, fields: FieldDecl[], exported: boolean): string {
  const body = printTypeExpr({ kind: "object", fields, span: null });
  const prefix = exported ? "export type" : "type";
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

/**
 * Emit context types, config types, and `createDataSources` for each datasource.
 * Returns an empty string when the program has no datasources.
 *
 * @param registryTypeName - Registry generic on `DataSource` / `defineDataSourceFor`.
 */
export function emitDataSources(program: Program, registryTypeName = "ContentRegistry"): string {
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

  const configFields = program.datasources
    .map((ds) => `    ${ds.name}: ${datasourceConfigTypeName(ds.name)};`)
    .join("\n");

  const sourceDefs = program.datasources
    .map((ds) => emitDatasourceDefinition(ds, `config.${ds.name}`))
    .join(",\n");

  parts.push(
    [
      `export function createDataSources<C extends ${ZIEL_EXECUTION_CONTEXT_TYPE_NAME}>(`,
      `  config: {`,
      configFields,
      `  }`,
      `): DataSource<${registryTypeName}, C>[] {`,
      `  const defineSource = defineDataSourceFor<${registryTypeName}, C>();`,
      ``,
      `  return [`,
      sourceDefs,
      `  ];`,
      `}`,
    ].join("\n")
  );

  return parts.join("\n\n");
}

/** True when any datasource may accept an implementation `when` on its config. */
export function datasourcesNeedSourceRouteContext(program: Program): boolean {
  return program.datasources.some(allowsImplWhen);
}
