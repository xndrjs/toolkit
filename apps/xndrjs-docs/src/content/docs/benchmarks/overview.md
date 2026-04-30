---
title: Overview
description: Benchmark strategy for xndrjs validation adapters
order: 1
seeAlso: |
  - [Run benchmarks](./run-benchmarks.md)
---

# Benchmarks overview

`@xndrjs/bench-perf` compares validation engines on shared, scenario-driven workloads.

Compared engines:

- `zod`
- `valibot`
- `ajv`
- `core`
- `raw`

## Important note

`@xndrjs/bench-perf` is a **private package** in this monorepo.  
Use it from the repository workspace, not from npm install flows.

## Goals

- compare throughput and latency under realistic scenarios
- keep runs reproducible through deterministic seed and fixed run params
- store machine-readable outputs plus markdown summaries

## Scenarios

- `runner-smoke`
- `migration-batch`
- `fe-medium-form`
- `fe-medium-form-transform`
