import path from "node:path";
import nodePlop from "node-plop";

export type RunScaffoldResult = {
  generator: string;
  changes: unknown[];
  failures: unknown[];
};

/**
 * Non-interactive scaffold: validate inputs externally, then run Plop actions only.
 * Does not call runPrompts — callers must supply the full answers object.
 */
export async function runScaffold(args: {
  plopfile: string;
  generator: string;
  answers: Record<string, unknown>;
  destBasePath?: string;
}): Promise<RunScaffoldResult> {
  const plop = await nodePlop(path.resolve(args.plopfile), {
    force: false,
    destBasePath: args.destBasePath ? path.resolve(args.destBasePath) : undefined,
  });

  const list = plop.getGeneratorList().map((g) => g.name);
  if (!list.includes(args.generator)) {
    throw new Error(
      `unknown scaffold generator "${args.generator}". known: ${list.join(", ") || "(none)"}`
    );
  }

  const generator = plop.getGenerator(args.generator);
  const promptsConfig = generator.prompts;
  const prompts = Array.isArray(promptsConfig) ? promptsConfig : [];
  if (typeof promptsConfig === "function") {
    throw new Error(
      `generator "${args.generator}" uses dynamic prompts; non-interactive run requires a static prompts array in v1`
    );
  }

  const missing: string[] = [];
  for (const prompt of prompts) {
    const name =
      typeof prompt === "object" && prompt && "name" in prompt ? String(prompt.name) : "";
    if (!name) continue;
    const value = args.answers[name];
    // Empty string is a provided value (optional fields). Only absent keys fail.
    if (value === undefined || value === null) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(`missing required inputs: ${missing.join(", ")}`);
  }

  // Re-run each prompt validate() when present (shared with interactive path).
  for (const prompt of prompts) {
    if (typeof prompt !== "object" || !prompt || !("name" in prompt)) continue;
    const name = String(prompt.name);
    const validate = "validate" in prompt ? prompt.validate : undefined;
    if (typeof validate !== "function") continue;
    const result = await validate(args.answers[name] as never, args.answers);
    if (result !== true) {
      throw new Error(`invalid input "${name}": ${result || "failed validation"}`);
    }
  }

  const { changes, failures } = await generator.runActions(args.answers);
  if (failures.length > 0) {
    const messages = failures.map((f) => JSON.stringify(f)).join("; ");
    throw new Error(`scaffold actions failed: ${messages}`);
  }

  return { generator: args.generator, changes, failures };
}
