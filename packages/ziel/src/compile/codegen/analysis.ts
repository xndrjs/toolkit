import { analyzeProgram, type ProgramAnalysis } from "../../check";
import type { Program } from "../../ir";

export type CodegenInput = Program | ProgramAnalysis;

export function codegenAnalysis(input: CodegenInput): ProgramAnalysis {
  return "program" in input ? input : analyzeProgram(input);
}
