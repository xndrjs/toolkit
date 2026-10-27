# 008 — Delete `spike/`

## Goal

Remove the throwaway PoC once the real implementation and tests cover the same ground.

## Depends on

- 006, 007

## Scope

- Delete `packages/plop-os/spike/` entirely.
- Remove gitignore entries specific to spike workspaces if unused.
- Drop README/ticket references that point at `spike/` as active code (keep historical mention in CHANGELOG only if useful).
- Confirm `docs/tickets/README.md` marks 001–007 done or close those issues.

## Acceptance

- [x] No `spike/` directory in the package.
- [x] Package build/test/lint green without spike.
- [x] README no longer tells people to look at spike for behavior.
