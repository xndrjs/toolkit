# Minimal plop-os example

Tiny consumer workspace: Discovery of `packages/:pkgName/models`, Scaffold of `.model.ts` files, and Sync of a `models-barrel` Region.

## Setup (this repo)

From `packages/plop-os`:

```bash
pnpm run build
```

This plopfile imports the built package via `../../dist/index.js`. In your own project, change that to:

```js
import { createPlopOs, plopAddFlags } from "plop-os";
```

## Try the CLI

From this directory:

```bash
node ../../dist/cli.js generators
node ../../dist/cli.js candidates --rule pkg-models
node ../../dist/cli.js run model --input '{"modelsPath":"packages/widgets/models","name":"world"}'
node ../../dist/cli.js sync --id models-barrel
```

`candidates` should list `widgets`. After `run` + `sync`, `packages/widgets/models/index.ts` exports both `hello` and `world` models.
