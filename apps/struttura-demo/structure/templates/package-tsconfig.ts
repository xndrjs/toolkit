/** Per-package tsconfig so the IDE and `tsc -b` resolve workspace imports. */
export function packageTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        composite: true,
        declaration: true,
        declarationMap: true,
        emitDeclarationOnly: true,
        outDir: ".tsbuild",
      },
      include: ["**/*.ts", "**/*.tsx"],
      exclude: ["node_modules", ".tsbuild"],
    },
    null,
    2
  )}\n`;
}
