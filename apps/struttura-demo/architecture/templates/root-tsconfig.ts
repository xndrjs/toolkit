import type { FileRenderContext } from "@xndrjs/struttura";

/** Solution-style root tsconfig: references every App / package packageDirectory. */
export function rootTsconfig(ctx: FileRenderContext): string {
  const packageConstructs = [
    "App",
    "CorePackage",
    "InfrastructurePackage",
    "AdapterPackage",
    "UiPackage",
  ] as const;
  const paths = new Set<string>();
  for (const constructName of packageConstructs) {
    for (const instance of ctx.query.instances(constructName)) {
      const packageDirectory = ctx.query
        .artifacts(instance)
        .find(
          (artifact) => artifact.artifactKey === "packageDirectory" && artifact.kind === "directory"
        );
      if (packageDirectory) {
        paths.add(`./${packageDirectory.path}`);
      }
    }
  }
  return `${JSON.stringify(
    {
      files: [],
      references: [...paths].sort().map((path) => ({ path })),
    },
    null,
    2
  )}\n`;
}
