# Scheduler benchmark comparison

- Cells: `1`
- Profile (typical): `pagebuilder`
- Warmup: `0`
- Repeats: `1`
- CMS / integration latency (typical): `20ms` / `80ms`

## Questions this report answers

1. At the same graph and configured batch size, does **lane reduce wall clock** vs barrier when integration latency ≫ CMS latency?
2. How do **batchCount and wall** scale as page size (`modules`) / arity grows and `cmsBatchSize` changes?
3. At the same configured `cmsBatchSize` max, how do **effective** batch sizes differ between lane and barrier (mean / median / p95, and full vs under-filled share)?

Δ% is `(lane − barrier) / barrier × 100`. For wall clock, **negative** means lane is faster.

## Wall clock (median ms)

| profile     | modules | depth | arity | stride | cmsBatch | graph (cms+prod) |   lane | barrier |  Δ% |
| ----------- | ------: | ----: | ----: | -----: | -------: | ---------------: | -----: | ------: | --: |
| pagebuilder |      32 |     5 |     3 |      3 |      100 |          474+326 | 671.70 |       — |   — |

## Batch count (median)

| profile     | modules | depth | arity | stride | cmsBatch |  lane | barrier |  Δ% |
| ----------- | ------: | ----: | ----: | -----: | -------: | ----: | ------: | --: |
| pagebuilder |      32 |     5 |     3 |      3 |      100 | 14.00 |       — |   — |

## Effective batch size — CMS (`onBatchStart.resourceCount`)

Values are **median across repeats** of each run's mean / median / p95 effective size.

| profile     | modules | cmsBatch | lane mean | barrier mean | lane median | barrier median | lane p95 | barrier p95 |
| ----------- | ------: | -------: | --------: | -----------: | ----------: | -------------: | -------: | ----------: |
| pagebuilder |      32 |      100 |     59.25 |            — |       57.50 |              — |   100.00 |           — |

## Effective batch size — integration

| profile     | modules | cmsBatch | lane mean | barrier mean | lane median | barrier median | lane p95 | barrier p95 |
| ----------- | ------: | -------: | --------: | -----------: | ----------: | -------------: | -------: | ----------: |
| pagebuilder |      32 |      100 |     54.33 |            — |       47.00 |              — |   100.00 |           — |

## CMS fill share (% of batches)

Buckets vs configured max: `eq1` (≤1), `lteHalf` (≤50%), `belowFull` (50%–max), `full` (≥max).

| profile     | modules | cmsBatch | lane full% | barrier full% | lane eq1% | barrier eq1% | lane ≤50% | barrier ≤50% |
| ----------- | ------: | -------: | ---------: | ------------: | --------: | -----------: | --------: | -----------: |
| pagebuilder |      32 |      100 |       37.5 |             — |      12.5 |            — |      25.0 |            — |

## Overlap (median ms with ≥2 batches in flight)

| profile     | modules | cmsBatch | lane | barrier |
| ----------- | ------: | -------: | ---: | ------: |
| pagebuilder |      32 |      100 | 0.00 |       — |

## Notes

- This run did not include both `lane` and `barrier` for the same dimensions, so Δ% columns are empty. Re-run with `--matrix` (or both strategies) for pairwise deltas.
