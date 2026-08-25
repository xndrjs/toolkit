# Scheduler benchmark comparison

- Cells: `18`
- Profile (typical): `pagebuilder`
- Warmup: `1`
- Repeats: `5`
- CMS / integration latency (typical): `20ms` / `80ms`

## Questions this report answers

1. At the same graph and configured batch size, does **lane reduce wall clock** vs barrier when integration latency ≫ CMS latency?
2. How do **batchCount and wall** scale as page size (`modules`) / arity grows and `cmsBatchSize` changes?
3. At the same configured `cmsBatchSize` max, how do **effective** batch sizes differ between lane and barrier (mean / median / p95, and full vs under-filled share)?

Δ% is `(lane − barrier) / barrier × 100`. For wall clock, **negative** means lane is faster.

## Wall clock (median ms)

| profile     | modules | depth | arity | stride | cmsBatch | graph (cms+prod) |   lane | barrier |     Δ% |
| ----------- | ------: | ----: | ----: | -----: | -------: | ---------------: | -----: | ------: | -----: |
| pagebuilder |      32 |     5 |     3 |      3 |       50 |          474+326 | 450.00 |  860.00 | -47.7% |
| pagebuilder |      32 |     5 |     3 |      3 |      100 |          474+326 | 450.00 |  534.00 | -15.7% |
| pagebuilder |      32 |     5 |     3 |      3 |      200 |          474+326 | 450.00 |  534.00 | -15.7% |
| pagebuilder |      48 |     5 |     3 |      3 |       50 |          721+496 | 612.00 | 1263.00 | -51.5% |
| pagebuilder |      48 |     5 |     3 |      3 |      100 |          721+496 | 531.00 |  698.00 | -23.9% |
| pagebuilder |      48 |     5 |     3 |      3 |      200 |          721+496 | 530.00 |  615.00 | -13.8% |
| pagebuilder |      64 |     5 |     3 |      3 |       50 |          947+652 | 774.00 | 1591.00 | -51.4% |
| pagebuilder |      64 |     5 |     3 |      3 |      100 |          947+652 | 692.00 |  862.00 | -19.7% |
| pagebuilder |      64 |     5 |     3 |      3 |      200 |          947+652 | 694.00 |  781.00 | -11.1% |

## Batch count (median)

| profile     | modules | depth | arity | stride | cmsBatch |  lane | barrier |     Δ% |
| ----------- | ------: | ----: | ----: | -----: | -------: | ----: | ------: | -----: |
| pagebuilder |      32 |     5 |     3 |      3 |       50 | 16.00 |   21.00 | -23.8% |
| pagebuilder |      32 |     5 |     3 |      3 |      100 | 12.00 |   13.00 |  -7.7% |
| pagebuilder |      32 |     5 |     3 |      3 |      200 | 11.00 |   12.00 |  -8.3% |
| pagebuilder |      48 |     5 |     3 |      3 |       50 | 23.00 |   31.00 | -25.8% |
| pagebuilder |      48 |     5 |     3 |      3 |      100 | 15.00 |   17.00 | -11.8% |
| pagebuilder |      48 |     5 |     3 |      3 |      200 | 12.00 |   13.00 |  -7.7% |
| pagebuilder |      64 |     5 |     3 |      3 |       50 | 29.00 |   39.00 | -25.6% |
| pagebuilder |      64 |     5 |     3 |      3 |      100 | 19.00 |   21.00 |  -9.5% |
| pagebuilder |      64 |     5 |     3 |      3 |      200 | 15.00 |   16.00 |  -6.3% |

## Effective batch size — CMS (`onBatchStart.resourceCount`)

Values are **median across repeats** of each run's mean / median / p95 effective size.

| profile     | modules | cmsBatch | lane mean | barrier mean | lane median | barrier median | lane p95 | barrier p95 |
| ----------- | ------: | -------: | --------: | -----------: | ----------: | -------------: | -------: | ----------: |
| pagebuilder |      32 |       50 |     43.09 |        43.09 |       50.00 |          50.00 |    50.00 |       50.00 |
| pagebuilder |      32 |      100 |     67.71 |        67.71 |       78.00 |          78.00 |   100.00 |      100.00 |
| pagebuilder |      32 |      200 |     79.00 |        79.00 |       57.50 |          57.50 |   181.50 |      181.50 |
| pagebuilder |      48 |       50 |     45.06 |        45.06 |       50.00 |          50.00 |    50.00 |       50.00 |
| pagebuilder |      48 |      100 |     80.11 |        80.11 |      100.00 |         100.00 |   100.00 |      100.00 |
| pagebuilder |      48 |      200 |    120.17 |       120.17 |      140.00 |         140.00 |   198.00 |      198.00 |
| pagebuilder |      64 |       50 |     47.35 |        47.35 |       50.00 |          50.00 |    50.00 |       50.00 |
| pagebuilder |      64 |      100 |     86.09 |        86.09 |      100.00 |         100.00 |   100.00 |      100.00 |
| pagebuilder |      64 |      200 |    135.29 |       135.29 |      156.00 |         156.00 |   200.00 |      200.00 |

## Effective batch size — integration

| profile     | modules | cmsBatch | lane mean | barrier mean | lane median | barrier median | lane p95 | barrier p95 |
| ----------- | ------: | -------: | --------: | -----------: | ----------: | -------------: | -------: | ----------: |
| pagebuilder |      32 |       50 |     65.20 |        32.60 |       65.00 |          32.50 |   100.00 |       50.00 |
| pagebuilder |      32 |      100 |     65.20 |        54.33 |      100.00 |          56.00 |   100.00 |       95.50 |
| pagebuilder |      32 |      200 |     65.20 |        54.33 |      100.00 |          47.00 |   100.00 |      100.00 |
| pagebuilder |      48 |       50 |     70.86 |        33.07 |      100.00 |          24.00 |   100.00 |       50.00 |
| pagebuilder |      48 |      100 |     82.67 |        62.00 |      100.00 |          57.00 |   100.00 |      100.00 |
| pagebuilder |      48 |      200 |     82.67 |        70.86 |      100.00 |          84.00 |   100.00 |      100.00 |
| pagebuilder |      64 |       50 |     72.44 |        34.32 |      100.00 |          46.00 |   100.00 |       50.00 |
| pagebuilder |      64 |      100 |     81.50 |        65.20 |      100.00 |          65.00 |   100.00 |      100.00 |
| pagebuilder |      64 |      200 |     81.50 |        72.44 |      100.00 |         100.00 |   100.00 |      100.00 |

## CMS fill share (% of batches)

Buckets vs configured max: `eq1` (≤1), `lteHalf` (≤50%), `belowFull` (50%–max), `full` (≥max).

| profile     | modules | cmsBatch | lane full% | barrier full% | lane eq1% | barrier eq1% | lane ≤50% | barrier ≤50% |
| ----------- | ------: | -------: | ---------: | ------------: | --------: | -----------: | --------: | -----------: |
| pagebuilder |      32 |       50 |       72.7 |          72.7 |       9.1 |          9.1 |       0.0 |          0.0 |
| pagebuilder |      32 |      100 |       42.9 |          42.9 |      14.3 |         14.3 |      14.3 |         14.3 |
| pagebuilder |      32 |      200 |       16.7 |          16.7 |      16.7 |         16.7 |      50.0 |         50.0 |
| pagebuilder |      48 |       50 |       81.3 |          81.3 |       6.3 |          6.3 |       6.3 |          6.3 |
| pagebuilder |      48 |      100 |       55.6 |          55.6 |      11.1 |         11.1 |      11.1 |         11.1 |
| pagebuilder |      48 |      200 |       16.7 |          16.7 |      16.7 |         16.7 |      33.3 |         33.3 |
| pagebuilder |      64 |       50 |       90.0 |          90.0 |       5.0 |          5.0 |       0.0 |          0.0 |
| pagebuilder |      64 |      100 |       72.7 |          72.7 |       9.1 |          9.1 |       0.0 |          0.0 |
| pagebuilder |      64 |      200 |       42.9 |          42.9 |      14.3 |         14.3 |      14.3 |         14.3 |

## Overlap (median ms with ≥2 batches in flight)

| profile     | modules | cmsBatch |   lane | barrier |
| ----------- | ------: | -------: | -----: | ------: |
| pagebuilder |      32 |       50 | 187.47 |  730.94 |
| pagebuilder |      32 |      100 | 104.93 |  405.73 |
| pagebuilder |      32 |      200 |  83.68 |  324.83 |
| pagebuilder |      48 |       50 | 293.75 | 1133.07 |
| pagebuilder |      48 |      100 | 146.44 |  568.14 |
| pagebuilder |      48 |      200 |  84.05 |  324.55 |
| pagebuilder |      64 |       50 | 376.69 | 1457.61 |
| pagebuilder |      64 |      100 | 189.11 |  729.52 |
| pagebuilder |      64 |      200 | 104.25 |  405.51 |
