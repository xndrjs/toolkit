# `plop-os`

Plop on steroids: scaffolding, codebase discovery, and explicit region sync.

Implementation is tracked in [`docs/tickets/`](./docs/tickets/). Domain language lives in [`GLOSSARY.md`](./GLOSSARY.md). A disposable PoC is under [`spike/`](./spike/) (delete when the tickets land).

## Plopfile sketch

```js
import { createPlopOs, plopAddFlags } from "plop-os";

export const plopOs = createPlopOs({ roots: [process.cwd()] });

plopOs.addDiscoveryRule({
  name: "core-models",
  pattern: "packages/core-:coreName/models",
  label: ({ data }) => data.coreName,
});

plopOs.syncGenerator("models-barrel", () => "export {};\n");

export default function (plop) {
  plop.setGenerator("demo", {
    description: "Scaffold demo",
    prompts: [{ type: "input", name: "name", message: "Name?" }],
    actions: [
      {
        type: "add",
        path: "out/{{name}}.ts",
        template: "export {};\n",
        ...plopAddFlags("throw"),
      },
    ],
  });
}
```
