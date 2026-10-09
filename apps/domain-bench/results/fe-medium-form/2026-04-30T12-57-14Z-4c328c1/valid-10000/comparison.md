# Benchmark comparison

- Scenario: `fe-medium-form`
- Mode: `valid`
- Input size: `10000`
- Warmup: `1000`
- Repeats: `7`
- Seed: `42`

| Engine  | Ops/s (median) | Ops/s (p95) | ms/op (median) | Heap delta bytes (median) |
| ------- | -------------: | ----------: | -------------: | ------------------------: |
| zod     |      181212.07 |   182348.24 |       0.005518 |                  15387816 |
| valibot |      164468.12 |   169537.62 |       0.006080 |                  12774640 |
| core    |     1600133.64 |  1981171.13 |       0.000625 |                   1360504 |
| raw     |    43068176.92 | 47762956.14 |       0.000023 |                    800472 |

## Notes

- Higher ops/s is better.
- Lower ms/op is better.
- Heap delta can be noisy and should be interpreted comparatively.
