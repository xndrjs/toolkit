import path from "node:path";
import nodePlop from "node-plop";

export type RunScaffoldResult = {
  generator: string;
  changes: unknown[];
  failures: unknown[];
};

export type RunScaffoldArgs = {
  plopfile: string;
  generator: string;
  answers: Record<string, unknown>;
  destBasePath?: string;
};

type PromptLike = {
  name?: string;
  validate?: (
    value: unknown,
    answers: Record<string, unknown>
  ) => boolean | string | Promise<boolean | string>;
};

/**
 * Non-interactive Scaffold: load a plopfile, re-apply missing-input and prompt
 * `validate` checks (same gates as interactive), then `runActions` only.
 *
 * Does not call `runPrompts`. Prompt `validate` should call
 * `plopOs.resolveCandidate` / shared helpers so both paths stay aligned.
 */
export async function runScaffold(args: RunScaffoldArgs): Promise<RunScaffoldResult> {
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
  if (typeof promptsConfig === "function") {
    throw new Error(
      `generator "${args.generator}" uses dynamic prompts; non-interactive run requires a static prompts array in v1`
    );
  }

  const prompts: PromptLike[] = Array.isArray(promptsConfig) ? promptsConfig : [];

  const missing: string[] = [];
  for (const prompt of prompts) {
    const name = typeof prompt?.name === "string" ? prompt.name : "";
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

  for (const prompt of prompts) {
    const name = typeof prompt?.name === "string" ? prompt.name : "";
    if (!name || typeof prompt.validate !== "function") continue;
    const result = await prompt.validate(args.answers[name], args.answers);
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
