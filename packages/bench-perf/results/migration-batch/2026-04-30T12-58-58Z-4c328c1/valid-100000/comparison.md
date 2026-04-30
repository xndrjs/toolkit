# Benchmark comparison

- Scenario: `migration-batch`
- Mode: `valid`
- Input size: `100000`
- Warmup: `1000`
- Repeats: `7`
- Seed: `42`

| Engine  | Ops/s (median) | Ops/s (p95) | ms/op (median) | Heap delta bytes (median) |
| ------- | -------------: | ----------: | -------------: | ------------------------: |
| zod     |      423393.32 |   430931.33 |       0.002362 |                  22219112 |
| valibot |      368704.41 |   387776.09 |       0.002712 |                  -3683704 |
| core    |     2872507.16 |  3391825.85 |       0.000348 |                  13601008 |
| raw     |    43649842.71 | 43926956.21 |       0.000023 |                   8000688 |

## Notes

- Higher ops/s is better.
- Lower ms/op is better.
- Heap delta can be noisy and should be interpreted comparatively.
