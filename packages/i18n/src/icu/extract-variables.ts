import type { parse } from "@formatjs/icu-messageformat-parser";

export type VariableType = "string" | "number" | "date";
export type VariableSpec = Record<string, VariableType>;

export type VariableRole =
  | "simple"
  | "plural"
  | "selectordinal"
  | "select"
  | "number"
  | "date"
  | "time";

export type VariableMeta = {
  type: VariableType;
  roles: Set<VariableRole>;
};

export type VariableMetaSpec = Record<string, VariableMeta>;

type IcuAst = ReturnType<typeof parse>;
type IcuNode = IcuAst[number];

function isPluralOrOrdinalNode(node: IcuNode): node is Extract<IcuNode, { type: 6 }> {
  return node.type === 6 && "pluralType" in node && Boolean(node.pluralType);
}

function hasVariableName(node: IcuNode): node is Extract<IcuNode, { value: string }> {
  return "value" in node && typeof node.value === "string";
}

function addVariableMeta(
  variables: VariableMetaSpec,
  name: string,
  type: VariableType,
  role: VariableRole
): void {
  const existing = variables[name];
  if (!existing) {
    variables[name] = { type, roles: new Set([role]) };
    return;
  }

  existing.roles.add(role);
  existing.type = mergeVariableTypes(existing.type, type);
}

function mergeVariableTypes(left: VariableType, right: VariableType): VariableType {
  if (left === right) {
    return left;
  }

  if ((left === "string" && right === "number") || (left === "number" && right === "string")) {
    return "number";
  }

  return right;
}

export function extractVariableMeta(nodes: IcuAst): VariableMetaSpec {
  const variables: VariableMetaSpec = {};

  const walk = (walkNodes: IcuAst) => {
    for (const node of walkNodes) {
      if (node.type === 1 && hasVariableName(node)) {
        addVariableMeta(variables, node.value, "string", "simple");
      } else if (node.type === 2 && hasVariableName(node)) {
        addVariableMeta(variables, node.value, "number", "number");
      } else if (isPluralOrOrdinalNode(node) && hasVariableName(node)) {
        const role = node.pluralType === "ordinal" ? "selectordinal" : "plural";
        addVariableMeta(variables, node.value, "number", role);
      } else if (node.type === 3 && hasVariableName(node)) {
        addVariableMeta(variables, node.value, "date", "date");
      } else if (node.type === 4 && hasVariableName(node)) {
        addVariableMeta(variables, node.value, "date", "time");
      } else if (node.type === 5 && hasVariableName(node)) {
        addVariableMeta(variables, node.value, "string", "select");
      }

      if ("options" in node && node.options) {
        for (const option of Object.values(node.options)) {
          walk(option.value);
        }
      }

      if ("children" in node && Array.isArray(node.children)) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return variables;
}

export function variableMetaToSpec(meta: VariableMetaSpec): VariableSpec {
  return Object.fromEntries(Object.entries(meta).map(([name, entry]) => [name, entry.type]));
}

export function extractVariables(nodes: IcuAst): VariableSpec {
  return variableMetaToSpec(extractVariableMeta(nodes));
}

export function inferMergedVariableType(roles: Set<VariableRole>): VariableType | "CONFLICT" {
  const hasPlural = roles.has("plural");
  const hasSelectordinal = roles.has("selectordinal");
  const hasSelect = roles.has("select");
  const hasSimple = roles.has("simple");
  const hasNumber = roles.has("number");
  const hasDate = roles.has("date");
  const hasTime = roles.has("time");

  // Incompatible numeric ICU constructs on the same variable.
  if (hasPlural && hasSelectordinal) {
    return "CONFLICT";
  }

  // Select (string-family) vs plural / ordinal / number-format (number-family).
  if (hasSelect && (hasPlural || hasSelectordinal || hasNumber)) {
    return "CONFLICT";
  }

  // Legacy explicit pairs — covered by the rule above, kept for clarity.
  if (hasPlural && hasSelect) {
    return "CONFLICT";
  }

  if (hasSelectordinal && hasSelect) {
    return "CONFLICT";
  }

  if (hasDate || hasTime) {
    if (hasPlural || hasSelect || hasSelectordinal || hasSimple || hasNumber) {
      return "CONFLICT";
    }
    return "date";
  }

  if (hasPlural || hasSelectordinal || hasNumber) {
    return "number";
  }

  if (hasSelect || hasSimple) {
    return "string";
  }

  return "string";
}

export function mergeVariableMetaAcrossLocales(
  localeMetas: readonly VariableMetaSpec[]
): { ok: true; merged: VariableSpec } | { ok: false; message: string } {
  const keySignatures = localeMetas.map((meta) => Object.keys(meta).sort().join(","));
  if (new Set(keySignatures).size > 1) {
    return {
      ok: false,
      message: `Inconsistent ICU variable names across locales (keys: ${keySignatures.join(" vs ")})`,
    };
  }

  const merged: VariableSpec = {};
  const variableNames = new Set(localeMetas.flatMap((meta) => Object.keys(meta)));

  for (const variableName of variableNames) {
    const combinedRoles = new Set<VariableRole>();

    for (const meta of localeMetas) {
      for (const role of meta[variableName]?.roles ?? []) {
        combinedRoles.add(role);
      }
    }

    const mergedType = inferMergedVariableType(combinedRoles);
    if (mergedType === "CONFLICT") {
      const rolesByLocale = localeMetas
        .map((meta) => {
          const entry = meta[variableName];
          if (!entry) {
            return null;
          }
          return [...entry.roles].sort().join("|");
        })
        .filter((value): value is string => value !== null);

      return {
        ok: false,
        message: `Incompatible ICU variable "${variableName}" across locales (roles: ${rolesByLocale.join(" vs ")})`,
      };
    }

    merged[variableName] = mergedType;
  }

  return { ok: true, merged };
}

export function mergeVariableSpecs(target: VariableSpec, source: VariableSpec): VariableSpec {
  const merged = { ...target };

  for (const [varName, varType] of Object.entries(source)) {
    const existing = merged[varName];
    if (existing && existing !== varType) {
      merged[varName] = "number";
    } else {
      merged[varName] = varType;
    }
  }

  return merged;
}

export function variableSpecsEqual(a: VariableSpec, b: VariableSpec): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key, index) => {
    if (key !== bKeys[index]) {
      return false;
    }
    return a[key] === b[key];
  });
}
