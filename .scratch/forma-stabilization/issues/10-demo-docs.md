# 10: Demo depth + packaging/docs drift

**What to build:** Non-shallow Orders path; second Adapter + dual composition; async fake connection; Design C safe disposal; package `files` include glossary/docs; README version/quickstart/monorepo blurb.

**Blocked by:** 05, 06, 09

**Status:** done

- [x] GetOrder applies real policy (auth via seed), not pure forward
- [x] In-memory Adapter + selectable dual composition (postgres | memory)
- [x] Postgres connection acquired asynchronously; dispose logged
- [x] Demo uses `await using` root + `withExecutionContext`
- [x] `@xndrjs/forma` pack contains `GLOSSARY.md` + `docs/`
- [x] README version `0.1.0-alpha.0`; quickstart self-contained; monorepo blurb fixed
- [x] Changeset

**Verify:** `pnpm --filter @xndrjs/forma-demo start` (and `start -- memory`); `cd packages/forma && npm pack --pack-destination artifacts` lists glossary/adr; typecheck both.

**Refs:** `packages/forma/docs/architectural-review.md` (Review di forma-demo; Packaging)
