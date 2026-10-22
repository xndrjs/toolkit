# Refactor example — navigable tree API (struttura-demo)

Documento di allineamento: riscrittura immaginata di `structure.ts` e `population.ts` secondo le decisioni del grilling (API ad albero, `A.in`, Peer root, reserved keys top-level, niente query in questo step).

Non è codice eseguibile finché l’API non esiste. Serve a verificare sintassi, modalità d’uso e gap di typechecking.

## Contratto usato qui

| Pezzo                | Forma                                                                           |
| -------------------- | ------------------------------------------------------------------------------- |
| Definizione          | `A.construct(name, dependencies, build)` — `dependencies` sempre, anche `{}`    |
| Collocazione         | ogni builder ritorna `A.in(destination, root)`                                  |
| Radice               | `A.dir(...)` \| `A.file(...)` \| mappa Peer root                                |
| Navigazione          | istanza = nodo radice; figli = chiavi dichiarate; niente `.artifacts`           |
| Reserved top-level   | `name`, `id`, `construct`, `dependencies`, `path`                               |
| Destination          | `A.destination(instance)` (symbol privato; stringa `destination` non riservata) |
| Materialization root | `A.rootDirectory`                                                               |
| Barrel ex-dinamici   | `scaffold` + contenuto iniziale semplice (es. `export {};\n`)                   |
| Sync statici         | restano `sync` dove gli export sono noti                                        |

---

## `structure.ts` (riscrittura)

```ts
import { defineStructure, toKebabCase } from "@xndrjs/struttura";

import { adapterMapperSource } from "./templates/adapter-mapper-source";
import { adapterPackageJson } from "./templates/adapter-package-json";
import { adapterReadme } from "./templates/adapter-readme";
import { adapterRepositorySource } from "./templates/adapter-repository-source";
import { appPackageJson } from "./templates/app-package-json";
import { capabilitiesSource } from "./templates/capabilities-source";
import { compositionRootSource } from "./templates/composition-root-source";
import { corePackageJson } from "./templates/core-package-json";
import { coreReadme } from "./templates/core-readme";
import { domainErrorSource } from "./templates/domain-error-source";
import { domainServiceSource } from "./templates/domain-service-source";
import { featureDesign } from "./templates/feature-design";
import { featureSpec } from "./templates/feature-spec";
import { infrastructureLoaderSource } from "./templates/infrastructure-loader-source";
import { infrastructurePackageJson } from "./templates/infrastructure-package-json";
import { infrastructureReadme } from "./templates/infrastructure-readme";
import { packageTsconfig } from "./templates/package-tsconfig";
import { pnpmWorkspaceYaml } from "./templates/pnpm-workspace-yaml";
import { portSource } from "./templates/port-source";
import { primitiveSource } from "./templates/primitive-source";
import { proofSource } from "./templates/proof-source";
import { shapeSource } from "./templates/shape-source";
import { uiIndex } from "./templates/ui-index";
import { uiPackageJson } from "./templates/ui-package-json";
import { uiReadme } from "./templates/ui-readme";
import { useCaseSource } from "./templates/use-case-source";
import { workspacePackageJson } from "./templates/workspace-package-json";

const A = defineStructure("CleanArchitectureOrientedMonorepo");

/** Starter statico: l’ex `rootTsconfig(ctx)` usava InventoryQuery. */
const workspaceRootTsconfigStarter = `${JSON.stringify({ files: [], references: [] }, null, 2)}\n`;

const emptyBarrel = "export {};\n";

export const WorkspaceRoot = A.construct("WorkspaceRoot", {}, () =>
  A.in(A.rootDirectory, {
    packageJson: A.file("package.json", workspacePackageJson()),
    pnpmWorkspace: A.file("pnpm-workspace.yaml", pnpmWorkspaceYaml()),
    // prima: mode sync + query su tutte le packageDirectory
    tsconfig: A.file("tsconfig.json", workspaceRootTsconfigStarter, {
      mode: "scaffold",
    }),
  })
);

export const FeatureSpec = A.construct("FeatureSpec", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`specs/${toKebabCase(name)}`, {
      spec: A.file("SPEC.md", featureSpec(name)),
      design: A.file("DESIGN.md", featureDesign(name)),
    })
  )
);

export const CorePackage = A.construct("CorePackage", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`packages/core-${toKebabCase(name)}`, {
      packageJson: A.file("package.json", corePackageJson(name)),
      tsconfig: A.file("tsconfig.json", packageTsconfig()),
      readme: A.file("README.md", coreReadme(name)),
    })
  )
);

export const ModelsModule = A.construct("ModelsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("models", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const OperationsModule = A.construct("OperationsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("operations", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const UseCasesModule = A.construct("UseCasesModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("use-cases", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const PortsModule = A.construct("PortsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("ports", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const ErrorsModule = A.construct("ErrorsModule", { core: CorePackage }, ({ core }) =>
  A.in(
    core,
    A.dir("errors", {
      index: A.file("index.ts", emptyBarrel),
    })
  )
);

export const Shape = A.construct("Shape", { models: ModelsModule }, ({ name, models }) =>
  A.in(models, A.file(`${toKebabCase(name)}.shape.ts`, shapeSource(name)))
);

export const Primitive = A.construct("Primitive", { models: ModelsModule }, ({ name, models }) =>
  A.in(models, A.file(`${toKebabCase(name)}.primitive.ts`, primitiveSource(name)))
);

export const Proof = A.construct("Proof", { models: ModelsModule }, ({ name, models }) =>
  A.in(models, A.file(`${toKebabCase(name)}.proof.ts`, proofSource(name)))
);

export const Capabilities = A.construct(
  "Capabilities",
  { operations: OperationsModule },
  ({ name, operations }) =>
    A.in(operations, A.file(`${toKebabCase(name)}.capabilities.ts`, capabilitiesSource(name)))
);

export const DomainService = A.construct(
  "DomainService",
  { operations: OperationsModule },
  ({ name, operations }) =>
    A.in(operations, A.file(`${toKebabCase(name)}.service.ts`, domainServiceSource(name)))
);

export const DomainError = A.construct(
  "DomainError",
  { errors: ErrorsModule },
  ({ name, errors }) =>
    A.in(errors, A.file(`${toKebabCase(name)}.error.ts`, domainErrorSource(name)))
);

export const Port = A.construct("Port", { ports: PortsModule }, ({ name, ports }) =>
  A.in(ports, A.file(`${toKebabCase(name)}.port.ts`, portSource(name)))
);

export const UseCase = A.construct("UseCase", { useCases: UseCasesModule }, ({ name, useCases }) =>
  A.in(useCases, A.file(`${toKebabCase(name)}.use-case.ts`, useCaseSource(name)))
);

export const InfrastructurePackage = A.construct("InfrastructurePackage", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`packages/infrastructure-${toKebabCase(name)}`, {
      loaders: A.dir({
        index: A.file("index.ts", emptyBarrel),
      }),
      schemas: A.dir({
        index: A.file("index.ts", emptyBarrel),
      }),
      index: A.file("index.ts", 'export * from "./loaders";\nexport * from "./schemas";\n', {
        mode: "sync",
      }),
      readme: A.file("README.md", infrastructureReadme(name)),
      packageJson: A.file("package.json", infrastructurePackageJson(name)),
      tsconfig: A.file("tsconfig.json", packageTsconfig()),
    })
  )
);

export const InfrastructureLoader = A.construct(
  "InfrastructureLoader",
  { infra: InfrastructurePackage },
  ({ name, infra }) =>
    A.in(infra.loaders, A.file(`${toKebabCase(name)}.loader.ts`, infrastructureLoaderSource(name)))
);

export const AdapterPackage = A.construct(
  "AdapterPackage",
  { core: CorePackage },
  ({ name, core }) =>
    A.in(
      A.rootDirectory,
      A.dir(`packages/adapter-${toKebabCase(name)}`, {
        mappers: A.dir({
          index: A.file("index.ts", emptyBarrel),
        }),
        repositories: A.dir({
          index: A.file("index.ts", emptyBarrel),
        }),
        packageJson: A.file("package.json", adapterPackageJson({ name, feature: core.name })),
        index: A.file("index.ts", 'export * from "./mappers";\nexport * from "./repositories";\n', {
          mode: "sync",
        }),
        readme: A.file("README.md", adapterReadme({ name, feature: core.name })),
        tsconfig: A.file("tsconfig.json", packageTsconfig()),
      })
    )
);

export const Mapper = A.construct(
  "Mapper",
  {
    adapter: AdapterPackage,
    shape: Shape,
    core: CorePackage,
  },
  ({ adapter, shape, core }) =>
    A.in(
      adapter.mappers,
      A.file(
        `${toKebabCase(shape.name)}.mapper.ts`,
        adapterMapperSource({
          shape: shape.name,
          feature: core.name,
        })
      )
    )
);

export const Repository = A.construct(
  "Repository",
  {
    adapter: AdapterPackage,
    shape: Shape,
    core: CorePackage,
  },
  ({ name, adapter, shape, core }) =>
    A.in(
      adapter.repositories,
      A.file(
        `${toKebabCase(name)}.repository.ts`,
        adapterRepositorySource({
          name,
          shape: shape.name,
          feature: core.name,
        })
      )
    )
);

export const UiPackage = A.construct("UiPackage", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`packages/ui-${toKebabCase(name)}`, {
      packageJson: A.file("package.json", uiPackageJson(name)),
      tsconfig: A.file("tsconfig.json", packageTsconfig()),
      index: A.file("index.ts", uiIndex(name)),
      readme: A.file("README.md", uiReadme(name)),
    })
  )
);

export const App = A.construct("App", {}, ({ name }) =>
  A.in(
    A.rootDirectory,
    A.dir(`apps/${toKebabCase(name)}`, {
      composition: A.dir({}),
      packageJson: A.file("package.json", appPackageJson(name)),
      tsconfig: A.file("tsconfig.json", packageTsconfig()),
    })
  )
);

export const CompositionRoot = A.construct("CompositionRoot", { app: App }, ({ name, app }) =>
  A.in(app.composition, A.file(`${toKebabCase(name)}.composition.ts`, compositionRootSource(name)))
);

export const structure = A.seal();

export const constructs = {
  WorkspaceRoot,
  FeatureSpec,
  CorePackage,
  ModelsModule,
  OperationsModule,
  UseCasesModule,
  PortsModule,
  ErrorsModule,
  Shape,
  Primitive,
  Proof,
  Capabilities,
  DomainService,
  DomainError,
  Port,
  UseCase,
  InfrastructurePackage,
  InfrastructureLoader,
  AdapterPackage,
  Mapper,
  Repository,
  UiPackage,
  App,
  CompositionRoot,
};
```

### Mappa accesso vecchio → nuovo

| Prima                                  | Dopo                    |
| -------------------------------------- | ----------------------- |
| `core.artifacts.packageDirectory`      | `core`                  |
| `core.artifacts.packageDirectory.path` | `core.path`             |
| `core.artifacts.tsconfig`              | `core.tsconfig`         |
| `models.artifacts.models`              | `models`                |
| `models.artifacts.index`               | `models.index`          |
| `shape.artifacts.source`               | `shape` (FileRef)       |
| `shape.artifacts.source.path`          | `shape.path`            |
| `infra.artifacts.loaders`              | `infra.loaders`         |
| `adapter.artifacts.repositories`       | `adapter.repositories`  |
| `app.artifacts.composition`            | `app.composition`       |
| `workspace.artifacts.packageJson`      | `workspace.packageJson` |
| `feature.artifacts.folder`             | `feature` (dir radice)  |
| `feature.artifacts.spec`               | `feature.spec`          |

`core.models` **non** esiste: ModelsModule è un’istanza separata; `createCore` la espone nel bundle di popolamento.

---

## `population.ts` (riscrittura)

La forma del popolamento resta quella generata; cambia ciò che puoi leggere sulle istanze.

```ts
import { createPopulateApi } from "./populate-api.generated";
import { defineStructure } from "@xndrjs/struttura";

// Solo per illustrare A.destination nello stesso file; in produzione
// A arriva dal modulo structure o da un import del package.
declare const A: ReturnType<typeof defineStructure>;

const P = createPopulateApi();

function createCore(name: string) {
  const core = P.CorePackage({ name });
  return {
    core,
    models: P.ModelsModule({ id: `${name}-models`, name: "models", core }),
    operations: P.OperationsModule({
      id: `${name}-operations`,
      name: "operations",
      core,
    }),
    useCases: P.UseCasesModule({
      id: `${name}-useCases`,
      name: "useCases",
      core,
    }),
    ports: P.PortsModule({ id: `${name}-ports`, name: "ports", core }),
    errors: P.ErrorsModule({ id: `${name}-errors`, name: "errors", core }),
  };
}

const workspace = P.WorkspaceRoot({ name: "workspace" });

P.FeatureSpec({ id: "spec-pagebuilder", name: "pagebuilder" });

const pagebuilder = createCore("pagebuilder");

const page = P.Shape({ name: "page", models: pagebuilder.models });
P.Primitive({ name: "pageSlug", models: pagebuilder.models });
P.Proof({ name: "publishedPage", models: pagebuilder.models });

P.Capabilities({
  id: "page-capabilities",
  name: "page",
  operations: pagebuilder.operations,
});
P.DomainService({ name: "pagePricing", operations: pagebuilder.operations });
P.DomainError({ name: "pageNotFound", errors: pagebuilder.errors });

P.Port({ name: "pageRepository", ports: pagebuilder.ports });
P.UseCase({ name: "resolvePage", useCases: pagebuilder.useCases });

const contentful = P.InfrastructurePackage({ name: "contentful" });
P.InfrastructureLoader({
  id: "page-loader",
  name: "page",
  infra: contentful,
});
const contentfulPagebuilder = P.AdapterPackage({
  name: "contentful-pagebuilder",
  core: pagebuilder.core,
});
P.Mapper({
  id: "page-mapper",
  name: "page",
  adapter: contentfulPagebuilder,
  shape: page,
  core: pagebuilder.core,
});
P.Repository({
  id: "page-repository",
  name: "pageRepository",
  adapter: contentfulPagebuilder,
  shape: page,
  core: pagebuilder.core,
});

P.UiPackage({ name: "react" });

const webNext = P.App({ name: "web-next" });
P.CompositionRoot({ name: "web-server", app: webNext });

// --- Navigazione tipizzata (attesa) ---
pagebuilder.core.path;
pagebuilder.core.packageJson;
pagebuilder.core.name; // reserved
pagebuilder.models.path;
pagebuilder.models.index;
page.path; // radice file
contentful.loaders;
contentfulPagebuilder.mappers;
contentfulPagebuilder.repositories;
webNext.composition;
workspace.packageJson;
workspace.tsconfig;

A.destination(pagebuilder.core); // A.rootDirectory
A.destination(page); // pagebuilder.models (DirRef)
A.destination(workspace); // A.rootDirectory (Peer root → forward)

// --- Errori TypeScript attesi ---
// pagebuilder.core.models;           // Property 'models' does not exist
// pagebuilder.core.artifacts;        // removed
// A.in(page, A.file("x.ts", ""));    // FileRef non è DirRef
// P.Shape({ name: "x", models: pagebuilder.core }); // dep sbagliata
// A.construct("X", ({ name }) => ...); // due argomenti: rifiutato

export const population = P.population;
```

---

## Cambi funzionali da non perdere di vista

1. **Barrel moduli / mappers / repositories / loaders / schemas**  
   Prima: `tsBarrelIndex` sync + `filesInDirectory`.  
   Ora: scaffold `export {};\n` — gli export si mantengono a mano (o con helper in uno step successivo).

2. **`WorkspaceRoot.tsconfig`**  
   Prima: sync che enumerava tutte le `packageDirectory` via query.  
   Ora: scaffold con `references: []` — **regressione** finché non torna un helper post-population.

3. **Provenance `repositories`**  
   Resta su `AdapterPackage` (`adapter.repositories`); `Repository` crea solo il file. Nessun cambio di ownership.

4. **Mapper filename**  
   Continua a usare `shape.name`, non `name` del Mapper.

5. **Manifest**  
   Nuove artifact key (`"."`, `packageJson`, `loaders.index`, …). Regen del manifest demo, niente alias.

---

## Gap di typechecking previsti

Ordine: dal più strutturale al più ergonomico.

### 1. Istanza = DirRef/FileRef + figli + reserved (intersezione)

Il tipo di `CorePackage` instance deve essere qualcosa come:

```ts
DirRef & {
  name: string;
  id: string;
  construct: /* ConstructDef<"CorePackage"> */;
  dependencies: {};
  path: string;
  packageJson: FileRef;
  tsconfig: FileRef;
  readme: FileRef;
}
```

**Gap:** se `DirRef` ha già indici aperti (`string` index signature) o campi extra, TypeScript non rifiuta chiavi inesistenti (`core.foo`). Serve branding stretto / mapped types dal codegen **senza** index signature pubblica.

### 2. Peer root vs DirRef

`WorkspaceRoot` non possiede un Artifact directory, ma deve essere usabile dove serve un DirRef (forward a `A.rootDirectory`).

**Gap:** unire “bag di figli” + “assegnabile a Destinazione/DirRef” senza far credere al typechecker che esista `workspace` come directory Artifact con key `"."`. Rischio: `workspace.path === ""` accettato in contesti che assumono artifact owned.

### 3. `A.in` destination: istanza di costrutto vs DirRef generico

`A.in(core, …)` e `A.in(models, …)` devono accettare l’istanza brandata (radice directory / Peer root), non un FileRef.

**Gap:** overload troppo larghi (`DirRef` non brandato) accettano qualsiasi directory di un altro costrutto senza legame di dipendenza dichiarato — il typing delle **dipendenze** di popolamento è separato dal typing di `A.in` in definizione. In definizione, `core` arriva già dal dependency contract; il rischio è riusare un DirRef “perso” (es. `core.packageJson` per errore di autocomplete se FileRef non è escluso).

### 4. Collisioni reserved vs chiavi figlie

`name` | `id` | `construct` | `dependencies` | `path` riservate.

**Gap tipico:** errore **runtime/diagnostica di seal**, non sempre errore TypeScript in definizione, se il builder ritorna un oggetto inferito troppo largo. Idealmente tipi che escludono quelle chiavi dai `children` (`Exclude<keyof C, Reserved>`).

`destination` come chiave figlia resta **legale** (helper via symbol).

### 5. Radice file vs directory

`Shape` instance: FileRef (+ reserved), **senza** figli.

**Gap:** stesso tipo generico “Instance” per file e dir indebolisce il controllo su `A.in(shape, …)`. Servono due forme generate (`*DirInstance` / `*FileInstance`) o un discriminant (`kind`) usabile nei conditional types di `A.in`.

### 6. Peer root: `A.destination` vs `.path`

Per WorkspaceRoot, destination = `A.rootDirectory`; non c’è artifact `"."`.

**Gap:** se il tipo espone comunque `.path` (forward), `workspace.path` e `A.destination(workspace).path` coincidono — ok — ma codegen non deve inventare `workspace["."]` o figli artifact fantasma.

### 7. Dipendenze branded

`P.Shape({ models: pagebuilder.core })` deve fallire.

**Gap:** se i factory generati accettano `DirRef` al posto di `ModelsModule` ref, il brand si perde. Oggi la demo punta a branded `*Ref`; va conservato sul nuovo oggetto navigabile (`Instance & { construct: … }` o brand nominale).

### 8. `A.construct` a due argomenti

Deve essere un errore di tipi (niente overload legacy).

**Gap:** facile da garantire; da verificare che non resti overload di compatibilità durante la migrazione parallela temporanea.

### 9. Contenuti: niente `FileRenderContext.query`

Template come `rootTsconfig(ctx)` oggi dipendono da `ctx.query`.

**Gap di prodotto più che di TS:** con soli literal/closure, TypeScript non può “sostituire” la query. O si cambia firma dei template (input espliciti), o si accetta scaffold. Il typechecker non segnala la regressione funzionale.

### 10. `A.destination` input

Solo istanze collocate, non definizioni di costrutto.

**Gap:** se `CorePackage` (definizione) e l’istanza condividono una shape simile, serve brand/`Instance` marker distinto altrimenti `A.destination(CorePackage)` potrebbe non errore.

### 11. Directory vuota `A.dir({})`

`app.composition` è una dir senza figli dichiarati.

**Gap:** tipo `{}` vs DirRef “opaco”: deve restare passabile a `A.in` e avere `.path`, senza suggerire chiavi figlie.

### 12. Override nome fisico `A.dir("use-cases", children)`

Proprietà TS = chiavi di `children` sull’istanza; il nome disco non appare nel tipo.

**Gap:** nessuno se modellato bene; rischio opposto se si espone una proprietà `useCases` fantasma oltre all’istanza stessa (come nel vecchio `artifacts.useCases` quando l’istanza era già il modulo).

---

## Checklist allineamento (per discussione)

- [ ] Peer root `WorkspaceRoot` come mappa sotto `A.in(A.rootDirectory, { … })`
- [ ] Moduli `A.in(core, A.dir(...))` con istanza = directory del modulo
- [ ] Shape/ecc. `A.in(models, A.file(...))` con istanza = file
- [ ] `core.name` reserved top-level (niente `sys`)
- [ ] `adapter.mappers` / `adapter.repositories` figli navigabili
- [ ] Barrel → scaffold; index package adapter/infra → sync statico
- [ ] `root` tsconfig → scaffold (gap query accettato per questo step)
- [ ] Popolamento invariato nella forma `P.Construct({ … })` + `createCore`
- [ ] Accetti i gap TS #1–#5 come vincoli sul codegen (branding stretto, Peer root, reserved keys)?

Se qualcosa nella sintassi degli snippet non corrisponde a come immagini l’API, segnala il punto preciso (costrutto + riga concettuale): aggiorniamo il documento prima di implementare.
