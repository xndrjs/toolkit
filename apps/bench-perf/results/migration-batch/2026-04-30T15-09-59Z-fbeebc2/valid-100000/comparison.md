# Benchmark comparison

- Scenario: `migration-batch`
- Mode: `valid`
- Input size: `100000`
- Warmup: `1000`
- Repeats: `7`
- Seed: `42`

| Engine  | Ops/s (median) | Ops/s (p95) | ms/op (median) | Heap delta bytes (median) |
| ------- | -------------: | ----------: | -------------: | ------------------------: |
| zod     |      418228.30 |   420289.52 |       0.002391 |                  22219168 |
| valibot |      361499.42 |   381941.34 |       0.002766 |                  -3683576 |
| ajv     |     1060077.49 |  1095351.01 |       0.000943 |                  16911536 |
| core    |     3135894.39 |  3356747.86 |       0.000319 |                  13600992 |
| raw     |    43165498.68 | 43577770.16 |       0.000023 |                   8000688 |

## Notes

- Higher ops/s is better.
- Lower ms/op is better.
- Heap delta can be noisy and should be interpreted comparatively.
