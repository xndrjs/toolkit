import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_REACT_BINDINGS_BASENAME = "react-bindings.generated.tsx";

const reactCodegenConfigSchema = z
  .object({
    output: z.string().min(1).optional(),
  })
  .strict();

export type ReactCodegenConfig = z.infer<typeof reactCodegenConfigSchema>;

export function defaultReactBindingsOutput(instanceOutput: string): string {
  return path.join(path.dirname(instanceOutput), DEFAULT_REACT_BINDINGS_BASENAME);
}

/** Loads optional `i18n-react.codegen.json` when present. */
export function loadReactCodegenConfig(configPath: string): ReactCodegenConfig {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[i18n-react Codegen Error] Failed to parse react config JSON (${configPath}): ${message}`
    );
  }

  const result = reactCodegenConfigSchema.safeParse(raw);
  if (!result.success) {
    const issueLines = result.error.issues.map((issue) => {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  - ${issuePath}: ${issue.message}`;
    });
    throw new Error(
      ["[i18n-react Codegen Error] Invalid i18n-react.codegen.json:", ...issueLines].join("\n")
    );
  }

  return result.data;
}

export function resolveReactBindingsOutputPath(options: {
  instanceOutput: string;
  cliOut?: string;
  reactConfig?: ReactCodegenConfig;
}): string {
  if (options.cliOut !== undefined) {
    return options.cliOut;
  }
  if (options.reactConfig?.output !== undefined) {
    return options.reactConfig.output;
  }
  return defaultReactBindingsOutput(options.instanceOutput);
}

export function defaultReactConfigPath(i18nConfigPath: string): string {
  const dir = path.dirname(i18nConfigPath);
  const base = path.basename(i18nConfigPath, path.extname(i18nConfigPath));
  if (base === "i18n.codegen") {
    return path.join(dir, "i18n-react.codegen.json");
  }
  return path.join(dir, `${base}.react.codegen.json`);
}
