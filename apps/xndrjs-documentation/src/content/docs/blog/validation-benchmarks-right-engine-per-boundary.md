---
title: "Validation benchmarks: pick the right engine per boundary"
description: What @xndrjs/bench-perf shows about Zod, Valibot, AJV, and core validators—and why adapter interoperability lets you use each where it shines.
date: 2026-05-19
tags:
  - benchmarks
  - performance
  - zod
  - ajv
  - valibot
  - domain
  - architecture
---

Choosing a validation library is often framed as a single project-wide decision: “we use Zod” or “we standardize on JSON Schema.” In practice, different boundaries have different constraints (OpenAPI contracts from another team, small form schemas on the client, bulk migration on the server) and **throughput is not the only variable**.

`xndrjs` does not force one engine globally. Each adapter exposes the same `Validator` contract; the domain layer stays the same. To make trade-offs concrete, we added **`@xndrjs/bench-perf`** (private app under `apps/bench-perf`): reproducible scenarios that compare engines on realistic payloads, not oversimplified ones.

This post summarizes baseline runs from that suite and how they support a **per-boundary** strategy: AJV where the contract already lives in OpenAPI, Zod where DX matters on the frontend, core validators where hot paths need predictable cost.

---

## What was measured (and what was not)

The benchmark CLI runs the **same inputs** through each engine with fixed `seed`, `warmup`, and `repeats`, then writes JSON plus a markdown comparison under `apps/bench-perf/results/`.

Engines in scope:

| Engine      | Role in the suite                                           |
| ----------- | ----------------------------------------------------------- |
| **zod**     | Typical app/FE schema style via `@xndrjs/domain-zod`        |
| **valibot** | Function-first schemas via `@xndrjs/domain-valibot`         |
| **ajv**     | JSON Schema / OpenAPI-shaped rules via `@xndrjs/domain-ajv` |
| **core**    | Hand-written `Validator` implementing the same rules        |
| **raw**     | No real validation—baseline for “parse and move on”         |

**Library versions** (resolved in the monorepo lockfile for `apps/bench-perf` at the time of these runs):

| Library | Version   | Notes                                                                                                                                                        |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Zod** | **4.3.6** | Declared as `^4.1.12` in `apps/bench-perf/package.json`; Zod 4.x API (e.g. `z.email()`). Results below are **not** comparable to Zod 3.x without re-running. |
| Valibot | 1.3.1     | Declared as `^1.1.0`                                                                                                                                         |
| AJV     | 8.20.0    | Via `@xndrjs/domain-ajv` peer/dev dependency                                                                                                                 |

Two scenarios mirror common workloads:

1. **`fe-medium-form`** — medium nested profile/contact payload (frontend form scale). Sizes: 2k / 10k records; parse-only profile.
2. **`migration-batch`** — flatter migration row (bulk ETL). Sizes: 100k / 500k; optional invalid ratio (1% at 100k, 5% at 500k).

Parameters for the runs cited below: `warmup=1000`, `repeats=7`, `seed=42`, **Zod 4.3.6**, built artifacts via `pnpm --filter @xndrjs/bench-perf bench:matrix` (see [`apps/bench-perf/README.md`](https://github.com/xndrjs/toolkit/tree/main/apps/bench-perf)).

**Non-goals:** absolute numbers on your laptop, “Zod is slow” slogans, or replacing profiling on your real hot path. The suite is for **architecture-oriented** comparisons when volume or latency budgets matter.

---

## Results: frontend-shaped workload (`fe-medium-form`, valid, 10k)

| Engine   | Ops/s (median) | ms/op (median) | vs Zod (throughput) |
| -------- | -------------: | -------------: | ------------------: |
| zod      |        181,212 |         0.0055 |                1.0× |
| valibot  |        164,468 |         0.0061 |               0.91× |
| **core** |  **1,600,134** |    **0.00063** |           **~8.8×** |
| raw      |     43,068,177 |       0.000023 |     (baseline only) |

On this scenario, **Zod and Valibot are in the same ballpark** (Zod slightly ahead here). The custom **core** validator implementing the same constraints is roughly **nine times faster** on median throughput.

Heap deltas in this run also favored core (lower median allocation trend than Zod/Valibot), though heap numbers are noisy and should be read comparatively—see the methodology notes in the bench-perf README.

**Takeaway for the FE boundary:** validating **one** medium form per submit is cheap with any engine—sub-millisecond per payload at these rates. Picking Zod or Valibot for ergonomics, transforms, and team familiarity is reasonable. Worry about engine choice when you validate **many** payloads per frame, replay large drafts, or run client-side batch checks—not for a typical single submit.

---

## Results: bulk migration (`migration-batch`, 100k, valid)

| Engine   | Ops/s (median) | ms/op (median) | vs Zod (throughput) |
| -------- | -------------: | -------------: | ------------------: |
| zod      |        418,228 |         0.0024 |                1.0× |
| valibot  |        361,499 |         0.0028 |               0.86× |
| **ajv**  |  **1,060,077** |    **0.00094** |           **~2.5×** |
| **core** |  **3,135,894** |    **0.00032** |           **~7.5×** |
| raw      |     43,165,499 |       0.000023 |     (baseline only) |

Ordering is stable: **core > ajv > zod ≈ valibot**, with AJV about **2.5×** Zod throughput and core about **7.5×** on valid rows.

At 100k records, median time to validate the whole batch (order of magnitude):

- Zod: ~240 ms
- AJV: ~94 ms
- Core: ~32 ms

Those are not user-perceived latencies for a single HTTP request—they illustrate **migration script or worker** cost when validation runs on every row.

---

## Invalid paths do not flip the ranking (`migration-batch`, 100k, ~1% invalid)

| Engine  | Ops/s (median) | vs Zod |
| ------- | -------------: | -----: |
| zod     |        279,439 |   1.0× |
| valibot |        311,176 |   1.1× |
| ajv     |        924,306 |  ~3.3× |
| core    |      3,034,570 | ~10.9× |

Failure paths cost more (issue construction, early exits), but **relative gaps stay similar**. Valibot can edge Zod slightly on invalid rows in this dataset; core and AJV still lead by a wide margin.

---

## How to read the `raw` baseline

`raw` is intentionally **not** a validation strategy: it measures looping and object handling without enforcing the contract. It is **orders of magnitude** faster than any real validator.

That gap is useful: it shows how much work is “real validation” vs overhead you might still pay in a hot loop. It also warns against micro-benchmarks that only compare library internals—production code still maps errors, builds domain values, and branches on success.

---

## Interoperability: the best engine per boundary, one domain model

The point of `xndrjs` is not to crown a single winner. It is to keep **one domain vocabulary** (`domain.primitive`, `domain.shape`, `domain.proof`, pipes) while letting each boundary use the engine that fits its **source of truth** and **performance budget**.

A practical split suggested by the benchmarks and by how teams already work:

### AJV — external OpenAPI / JSON Schema contracts

When the backend (or another team) publishes **OpenAPI**, rewriting the same rules in Zod by hand duplicates effort and drifts over time. AJV compiles the schema you already have; `@xndrjs/domain-ajv` bridges compiled validators into the shared `Validator` type.

In `migration-batch`, AJV sits **between** schema-library ergonomics and a tailored core validator: ~2.5–3× Zod on these rows, with semantics aligned to JSON Schema. That matches server ingress, webhooks, and codegen pipelines described in [OAS, JSON Schema, AJV](/blog/oas-jsonschema-ajv-domain/).

Use AJV when:

- the contract is **already** JSON Schema / OpenAPI;
- you want compile-once, validate-many behavior on the server;
- you accept AJV’s error shape at the boundary and normalize via `xndrjs` domain errors.

### Zod (or Valibot) — frontend and app-local schemas

For **small, app-owned** shapes—forms, feature flags, editor state—DX often beats the last microsecond. Zod’s inference, transforms, and ecosystem integration (e.g. `zodFromKit` to reuse a primitive inside a larger object) matter more than raw ops/s on a single submit.

The `fe-medium-form` numbers support that: Zod and Valibot are close; neither is “wrong” for medium forms at 10k **batch** scale, let alone one field blur event.

Use Zod or Valibot when:

- schemas are **authored in TypeScript** and change with the feature;
- you want transforms and readable schema code at the call site;
- throughput is dominated by network or UI, not validation.

See [Choose an adapter](/v0/getting-started/choosing-adapter/) for mixing adapters in one model.

### Core validators — hot server paths you control

The **core** engine in the suite is not magic: it is an explicit `Validator` with hand-written checks—exactly what `@xndrjs/domain` encourages when rules are stable and performance-sensitive.

It wins when:

- you run **high-volume** validation (migrations, stream processors, batch jobs);
- rules are fixed and you want minimal allocation and predictable branches;
- you are willing to maintain checks (or generate them later) in exchange for ~**8–10×** throughput vs Zod in these scenarios.

You do not need to rewrite the whole app in core. A single primitive or shape on the hot path—backed by the same kit types everywhere else—is enough.

---

## Example architecture (same domain, three engines)

```txt
OpenAPI (backend) ──► AJV + domain-ajv ──► User, Tier, …
                              │
Form / client feature ──► Zod + domain-zod ──► UserProfile, …
                              │
Migration worker ──► core Validator ──► MigrationRow
                              │
                    shared domain.proof / pipe / capabilities
```

Each arrow ends in a `Validator<Input, Output>`. After validation, **creation and composition APIs are identical**—that is the interoperability story the benchmarks support: measure engines separately, integrate them through one contract.

Minimal cross-adapter sketch (email from JSON Schema, profile from Zod):

```ts
import { domain, jsonSchemaToValidator } from "@xndrjs/domain-ajv";
import { zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

const Email = domain.primitive(
  "Email",
  jsonSchemaToValidator<string>({ type: "string", format: "email" })
);

const UserProfile = domain.shape(
  "UserProfile",
  zodToValidator(
    z.object({
      displayName: z.string().min(1),
      contact: zodFromKit(Email),
    })
  )
);
```

---

## Decision checklist (when numbers matter)

1. **Profile your boundary** — Use `bench:matrix` with the scenario closest to your workload (`fe-medium-form` vs `migration-batch`), same `mode` (`valid` / `invalid`), and pin `seed` / `input-size`.
2. **If the gap is small in your scenario**, prefer maintainability and existing team skills ([choosing an adapter](/v0/getting-started/choosing-adapter/)).
3. **If the gap is large on a hot path**, narrow optimization: one core `Validator`, or AJV for compiled external schemas—not a wholesale rewrite.
4. **Do not optimize away validation** — `raw` throughput is misleading for correctness; use it only as a sanity bound.
5. **Re-run on your runtime** — Node version, hardware, and error verbosity change absolute numbers; rankings here are from a fixed baseline in the monorepo.

Reproduce locally:

```bash
pnpm --filter @xndrjs/bench-perf bench:matrix -- \
  --scenario fe-medium-form --mode valid --input-size 10000 \
  --warmup 1000 --repeats 7 --seed 42

pnpm --filter @xndrjs/bench-perf bench:matrix -- \
  --scenario migration-batch --mode valid --input-size 100000 \
  --warmup 1000 --repeats 7 --seed 42
```

Reports land under `apps/bench-perf/results/<scenario>/<timestamp>-<commit>/`.

---

## Closing thought

Benchmarks do not replace product judgment. They make the cost of **uniform** engine choice visible: Zod everywhere is simple but it might be more expensive at migration scale; core everywhere is fast but wasteful on small FE-owned schemas; ignoring OpenAPI forces duplicate contracts.

`xndrjs` targets the middle ground—**one domain, many validators**—so you can align engine choice with each boundary’s source of truth and budget, then prove it with the same reproducible suite when it matters.
