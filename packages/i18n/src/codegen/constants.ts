export const SUPPORTED_IMPORT_EXTENSIONS = ["none", ".ts", ".js"] as const;
export type SupportedImportExtension = (typeof SUPPORTED_IMPORT_EXTENSIONS)[number];

// Translation keys and namespace names become TypeScript identifiers and
// template-literal type segments in the generated code, so they must be valid
// identifiers (e.g. "app.title" would emit the broken type `"app.title:..."`).
export const IDENTIFIER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const IDENTIFIER_NAME_REQUIREMENT =
  "allowed: letters, digits, underscore; must not start with a digit";
