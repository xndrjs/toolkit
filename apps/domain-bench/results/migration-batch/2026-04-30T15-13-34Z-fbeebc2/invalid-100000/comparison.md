# Benchmark comparison

- Scenario: `migration-batch`
- Mode: `invalid`
- Input size: `100000`
- Warmup: `1000`
- Repeats: `7`
- Seed: `42`

| Engine  | Ops/s (median) | Ops/s (p95) | ms/op (median) | Heap delta bytes (median) |
| ------- | -------------: | ----------: | -------------: | ------------------------: |
| zod     |      279438.70 |   308719.71 |       0.003579 |                 -11821848 |
| valibot |      311176.49 |   325496.76 |       0.003214 |                    673288 |
| ajv     |      924306.22 |   975030.81 |       0.001082 |                  20391968 |
| core    |     3034570.37 |  3236822.80 |       0.000330 |                  14067104 |
| raw     |    40830108.78 | 42103272.59 |       0.000024 |                   8000696 |

## Notes

- Higher ops/s is better.
- Lower ms/op is better.
- Heap delta can be noisy and should be interpreted comparatively.
