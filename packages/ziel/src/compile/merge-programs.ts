import type { Program } from "../ir";

const EMPTY_PROGRAM: Program = {
  scalars: [],
  resources: [],
  fragments: [],
  datasources: [],
  queries: [],
  span: null,
};

/**
 * Merge programs in input order by concatenating top-level declarations.
 * Name collisions are not resolved here — leave that to `checkProgram`.
 * The result's `span` is always `null`; node spans (and their URIs) are preserved.
 *
 * This is an IR utility, not a source compilation pipeline: programs lowered in
 * isolation have already resolved named types and fragment spreads. Use
 * `compileWorkspace` when source files may reference declarations in each other.
 */
export function mergePrograms(programs: Program[]): Program {
  if (programs.length === 0) {
    return EMPTY_PROGRAM;
  }

  if (programs.length === 1) {
    const program = programs[0]!;
    return {
      scalars: [...program.scalars],
      resources: [...program.resources],
      fragments: [...program.fragments],
      datasources: [...program.datasources],
      queries: [...program.queries],
      span: null,
    };
  }

  return {
    scalars: programs.flatMap((p) => p.scalars),
    resources: programs.flatMap((p) => p.resources),
    fragments: programs.flatMap((p) => p.fragments),
    datasources: programs.flatMap((p) => p.datasources),
    queries: programs.flatMap((p) => p.queries),
    span: null,
  };
}
