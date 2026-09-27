/**
 * Lower `datasource Name { … }` AST → DatasourceDefinition IR.
 * Route `when` uses the same PathRef classification as queries (payloadRef /
 * identityRef / …); the checker rejects payload access in datasource predicates.
 */
import type { DatasourceDefinition, DatasourceResourceRoute } from "../../ir";
import {
  type DatasourceDeclaration as AstDatasourceDeclaration,
  type DatasourceRoute as AstDatasourceRoute,
} from "../../lang/generated/ast";
import { lowerExpr } from "./expr";
import { spanOf } from "./span";
import { lowerTypedField, type NameTables } from "./types";

export function lowerDatasource(
  decl: AstDatasourceDeclaration,
  tables: NameTables
): DatasourceDefinition {
  return {
    name: decl.name,
    contextFields: decl.context ? decl.context.fields.map((f) => lowerTypedField(f, tables)) : [],
    routes: decl.routes.map(lowerDatasourceRoute),
    span: spanOf(decl),
  };
}

export function lowerDatasourceRoute(route: AstDatasourceRoute): DatasourceResourceRoute {
  return {
    resource: route.resource,
    alias: route.binding ?? null,
    when: route.when ? lowerExpr(route.when) : null,
    span: spanOf(route),
  };
}
