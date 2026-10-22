import { defineArchitecture } from "../architecture/define-architecture";
import { toKebabCase } from "../casing/casing";
import { createPopulation, type Population } from "../population/create-population";

/**
 * Compact CleanArchitecture guide layout used across apply/derive/inspect tests.
 * Tree authoring only: CorePackage (dir root + layer dirs), Model/UseCase file roots,
 * PackageJson peer file under materialization root.
 */
export function buildGuideArchitecture(architectureName = "CleanArchitecture") {
  const A = defineArchitecture(architectureName);

  const corePackage = A.construct("CorePackage", {}, ({ name }) =>
    A.in(
      A.rootDirectory,
      A.dir(`packages/core-${toKebabCase(name)}`, {
        models: A.dir({
          index: A.file("index.ts", "// models barrel\n", { mode: "sync" }),
        }),
        ports: A.dir({
          index: A.file("index.ts", "// ports barrel\n", { mode: "sync" }),
        }),
        useCases: A.dir("use-cases", {
          index: A.file("index.ts", "// use-cases barrel\n", { mode: "sync" }),
        }),
        operations: A.dir({
          index: A.file("index.ts", "// operations barrel\n", { mode: "sync" }),
        }),
      })
    )
  );

  const model = A.construct("Model", { core: corePackage }, ({ name, core }) =>
    A.in(
      core.models,
      A.file(`${toKebabCase(name)}.model.ts`, `export type ${name} = { id: string };\n`)
    )
  );

  const useCase = A.construct("UseCase", { package: corePackage }, ({ name, package: pkg }) =>
    A.in(pkg.useCases, A.file(`${toKebabCase(name)}.use-case.ts`, `export function ${name}() {}\n`))
  );

  const packageJson = A.construct("PackageJson", {}, () =>
    A.in(A.rootDirectory, {
      packageJson: A.file("package.json", '{ "name": "project" }\n'),
    })
  );

  return {
    A,
    architecture: A.seal(),
    constructs: {
      CorePackage: corePackage,
      Model: model,
      UseCase: useCase,
      PackageJson: packageJson,
    },
  };
}

export function buildGuidePopulation(): Population {
  const { A, constructs } = buildGuideArchitecture();
  const population = createPopulation(A);
  const pagebuilder = population.add(constructs.CorePackage, { name: "pagebuilder" });
  population.add(constructs.Model, { name: "page", core: pagebuilder });
  population.add(constructs.Model, { name: "pageSlug", core: pagebuilder });
  population.add(constructs.UseCase, { name: "resolvePage", package: pagebuilder });
  population.add(constructs.PackageJson, { name: "packageJson" });
  return population;
}
