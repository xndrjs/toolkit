import type { parse } from "@formatjs/icu-messageformat-parser";

export type VariableType = "string" | "number" | "date";
export type VariableSpec = Record<string, VariableType>;

type IcuAst = ReturnType<typeof parse>;
type IcuNode = IcuAst[number];

function isNumericIcuNode(node: IcuNode): boolean {
  if (node.type === 2) {
    return true;
  }

  if (node.type === 6 && "pluralType" in node && node.pluralType) {
    return true;
  }

  return false;
}

function hasVariableName(node: IcuNode): node is Extract<IcuNode, { value: string }> {
  return "value" in node && typeof node.value === "string";
}

export function extractVariables(nodes: IcuAst): VariableSpec {
  const variables: VariableSpec = {};

  const walk = (walkNodes: IcuAst) => {
    for (const node of walkNodes) {
      if (node.type === 1) {
        variables[node.value] = variables[node.value] ?? "string";
      } else if (isNumericIcuNode(node) && hasVariableName(node)) {
        variables[node.value] = "number";
      } else if ((node.type === 3 || node.type === 4) && hasVariableName(node)) {
        variables[node.value] = "date";
      } else if (node.type === 5 && hasVariableName(node)) {
        variables[node.value] = variables[node.value] ?? "string";
      } else if (node.type === 6 && hasVariableName(node)) {
        variables[node.value] = variables[node.value] ?? "string";
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
