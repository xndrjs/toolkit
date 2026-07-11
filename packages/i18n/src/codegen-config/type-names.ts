export function inferProjectName(dirName: string): string {
  const parts = dirName.split(/[-_]+/).filter(Boolean);
  if (parts.length === 0) {
    return "App";
  }

  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

export function typeNamesForProject(project: string): {
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName: string;
} {
  return {
    paramsTypeName: `${project}Params`,
    schemaTypeName: `${project}Schema`,
    localeTypeName: `${project}Locale`,
  };
}
