# @xndrjs/plop-os

Scaffolding, codebase discovery, and explicit region sync on top of Plop (“Plop on steroids”; also reads as a small OS on Plop).

## Language

**Discovery**:
A shared read primitive over the real filesystem: list, filter, and derive data from paths by convention. Used by Scaffold and Sync. Standalone/external use is optional, not a core requirement. Walks configured roots (default: workspace) with ignore globs; an invocation may narrow to a base directory inside those roots.
_Avoid_: query language, architecture index, population model

**Discovery rule**:
A consumer-registered rule that turns matching filesystem paths (directories and files) into Candidates. Path → `data` uses **`path-to-regexp`** patterns as the primary bind mode (e.g. `packages/core-:coreName/models`). Regex named groups and an optional custom `(path) => data` function are escape hatches. Enumeration walks dirs and files under roots; v1 has no richer query DSL.
_Avoid_: architecture query, population selector, regex-first API

**Candidate**:
A Discovery hit: filesystem `path`, selectable `label`, derived `data`, and `kind` (`file` | `directory` from the real filesystem — never inferred from the path name). Interactive prompts and non-interactive inputs must both resolve to a valid Candidate or fail. Not a persisted entity. Subpaths chosen under a Candidate must stay inside that Candidate path.
_Avoid_: destination (as a vague synonym), match, hit

**Scaffold generator**:
A named generator that creates files and directories at a chosen destination. In v1 this is a Plop generator (possibly wrapped). Creation does not imply later automatic updates.
_Avoid_: generator (unqualified), construct, artifact

**Sync generator**:
A function registered under a Sync ID that replaces the interior of matching Regions. Same ID may appear in many files; each Region runs in its own local context. Throws or non-string results abort the whole Sync pass with no writes.
_Avoid_: generator (unqualified), reconciler, artifact identity

**Sync ID**:
The registry name of a Sync generator. It labels Regions and selects which function runs; it does not identify a single occurrence.
_Avoid_: region id, artifact id

**Region**:
A marked interval in one file, bounded by matching `plop-os-sync start|end <syncId>` line markers (`//` or `#` in v1). One local execution context per Region. Regions must be balanced and non-nested; malformed markers fail the Sync pass before any write.
_Avoid_: block, section, artifact

**Sync context (`ctx`)**:
Per-Region locality (`filePath`, `syncId`, …) plus the configured Discovery read API. No artifact identity store or architecture graph.
_Avoid_: population context, reconciliation plan

**Scaffold** / **Sync**:
The two public operations. Scaffold creates; Sync updates only marked Region interiors in an explicit, fail-closed pass. They are distinct.
_Avoid_: populate, reconcile, generate (as a single umbrella verb)

**Conflict policy**:
What Scaffold does when a target file already exists: `skip`, `overwrite`, or `throw`. Default is `throw`. Overwrite replaces that file only; existing directories may be reused for children and are never wiped recursively.
_Avoid_: force (as an undefined umbrella), reconcile
