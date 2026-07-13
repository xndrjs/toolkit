# Analisi: API fluent e type-safety su `t`

**Data:** 2026-07-13  
**Scope:** `@xndrjs/i18n` (runtime + codegen)  
**Stato:** analisi in corso — decisioni architetturali in §1.1; spec rigorosa in [`spec-engine-scope-builder.md`](./spec-engine-scope-builder.md)  
**Nota:** parte del runtime (builder, scope, codegen) è già stata implementata in parallelo a questo documento. **Non estendere il codice finché l’analisi non è allineata.**

---

## 1. Sintesi

L'API attuale (pre-refactor) esponeva `.get()` su un provider il cui schema TypeScript rappresenta **l'intero contratto del progetto** (tutte le chiavi, tutti i namespace, tutte le locale), indipendentemente da cosa è effettivamente caricato a runtime.

Questo crea un divario sistematico tra **type safety compile-time** e **garanzie runtime**: TypeScript suggerisce chiavi e locale sempre disponibili, ma in molte configurazioni di delivery la traduzione può fallire (namespace non caricato) o risolversi con `onMissing` (chiave/locale assente nel dizionario parziale).

La proposta — e la direzione confermata — è:

1. **Rimuovere `.t()`** dal provider “grezzo”; tradurre solo su **scope** type-safe.
2. Far restituire a `createI18n` un **builder fluent** (lazy) o uno **scope** pronto (eager) quando risorsa e namespace sono noti.
3. **Eliminare `hasNamespace` e `loadedNamespaces`** — ridondanti con le chiavi del dizionario.
4. **Unificare read + write** sullo stesso oggetto: lo **scope locale-bound** restituito da `load()` espone `t(...)` e `set(...)` (locale implicita).
5. **Eliminare** dalle API pubbliche: `setAll`, `setNamespace`, `mergeAll`, `mergeNamespace`, `withNamespaceData`, `withDictionaryData`.
6. Nella demo, eliminare `createI18nForArea` / `createI18nForLocale` a favore del builder.
7. **Valutare validazione esterna per-chiave** — oggi all-or-nothing; serve per patch runtime validate (§13).

Obiettivo: allineare il contratto TypeScript alle garanzie runtime — _se compila, la risorsa/chiave è pronta_.

### 1.1 Decisioni prese (2026-07-13)

| Tema                       | Decisione                                 | Rationale                                                                                                                                                                         |
| -------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Naming**                 | **`Scope`**, non `View`                   | `I18nScopeSingle`, `I18nScopeMulti`, `I18nScope*ForLocale`. “View” implica read-only; lo scope è l’interfaccia operativa read+write nel contesto (namespace + locale).            |
| **Proiezione engine**      | `toScope()`                               | Proietta un’interfaccia tipizzata dall’engine interno. L’engine non è la superficie pubblica dell’app.                                                                            |
| **Traduzione**             | **`t(...)`**, non `get`                   | Coerenza ecosistema React/i18n; `get` resta solo nel passato.                                                                                                                     |
| **Binding partition**      | **`withLocale` / `withDeliveryArea`**     | Nomi codegen-specifici, non `withResource` generico.                                                                                                                              |
| **Locale per `load()`**    | **Una partition per load**                | `withLocale("it").load()` — non `withLocales([...])`. Split-by-locale = un chunk per partition; scope locale-bound ergonomico; accumulo via load successive sullo stesso builder. |
| **Read vs write**          | **Unificati sullo scope**                 | `enScope.set("billing", "invoice_summary", "...")` — locale implicita da `withLocale("en").load()`. Niente `engine.forLocale().set()` separato.                                   |
| **Dove patchare**          | **Scope locale-bound**, non builder       | Il builder è config immutabile (`withX` clona state). `load()` materializza il contesto traducibile.                                                                              |
| **Replace / merge grezzo** | **Eliminati** (non deprecati)             | `setAll`, `setNamespace`, `mergeAll`, `mergeNamespace` rompono le garanzie monotoniche o permettono locale non precaricate.                                                       |
| **Hydration builder**      | **`withNamespaceData` eliminato**         | Equivalente a merge pubblico; sostituito da `load()` + `scope.set()`.                                                                                                             |
| **Preload gate**           | **`set()` solo post-`load()`**            | Patch ammessa solo se `(namespace?, key, locale)` è stata precaricata via builder+loader.                                                                                         |
| **Builder immutabile**     | **`withX` clona state, engine condiviso** | Ogni `load()` merge deep nell’engine condiviso; scope diversi vedono lo stesso store.                                                                                             |

**Esempio canonico (multi, split-by-locale):**

```ts
const builder = createI18n({}).withNamespaces(["billing"] as const);
const enScope = await builder.withLocale("en").load();

enScope.t("billing", "invoice_summary", { count: 2 });
enScope.set("billing", "invoice_summary", "You have {count} invoices");
```

**Delivery area:** `load()` senza `withLocale` restituisce scope unbound → `.forLocale("it")` prima di `set()`.

```ts
const euScope = await builder.withDeliveryArea("eu").load();
euScope.forLocale("it").set("billing", "invoice_summary", "…");
```

---

## 2. Stato attuale

### 2.1 Superficie API rilevante

| Elemento                                    | Dove                              | Ruolo                                                            |
| ------------------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `createI18n(dictionary, options?)`          | `instance.generated.ts` (codegen) | Factory → `IcuTranslationProviderSingle` o `Multi`               |
| `.get(key, locale, params?)`                | Single                            | Traduzione type-safe su **tutto** `Schema`                       |
| `.get(ns, key, locale, params?)`            | Multi                             | Idem su **tutti** i namespace di `Schema`                        |
| `.forLocale(locale)`                        | Entrambi                          | Scope con locale fissato; **nessun restringimento** sulle chiavi |
| `hasNamespace` / `loadedNamespaces`         | Multi                             | Tracking namespace caricato — **da eliminare** (vedi §2.5)       |
| `setNamespace` / `mergeNamespace`           | Multi                             | **Target: rimossi** — sostituiti da `load()` + `scope.set()`     |
| `ensureNamespacesLoadedForLocale`           | Codegen (split-by-locale)         | Carica artifact per locale, merge sull'istanza                   |
| `ensureNamespacesLoadedForArea`             | Codegen (custom delivery)         | Idem per delivery area                                           |
| `createI18nForLocale` / `createI18nForArea` | Demo (`multi`, `areas`)           | `createI18n({})` + ensure + return                               |

### 2.2 Garanzie runtime per modalità di delivery

| Modalità                | Single                                                  | Multi                                                       | Chiavi “pronte” dopo init                      |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| **Canonical** (eager)   | Tutte le chiavi, tutte le locale nel dizionario passato | Namespace in `loadOnInit` (o tutti se non configurato lazy) | Sì, per ciò che è stato passato a `createI18n` |
| **Canonical** (lazy ns) | N/A (single è sempre eager)                             | Solo namespace eager; altri richiedono `setNamespace`       | Solo eager; altri → **throw** a runtime        |
| **Split-by-locale**     | `createI18n({})` — dizionario vuoto                     | `createI18n({})` — nessun namespace caricato                | No: serve caricare artifact per locale         |
| **Custom delivery**     | Come split-by-locale                                    | Come split-by-locale                                        | No: serve caricare artifact per area           |

### 2.3 Il problema di fondo

```ts
// Multi, split-by-locale — compila senza errori
const i18n = createI18n({});
i18n.get("billing", "invoice_summary", "it", { count: 3 });
// → runtime: throw "[i18n] Namespace not loaded: billing"
```

```ts
// Single, split-by-locale — compila; a runtime onMissing o stringa vuota
const i18n = createI18n({});
i18n.get("welcome", "it", { name: "Ada" });
// → dizionario vuoto: nessuna chiave caricata
```

TypeScript non distingue:

- namespace caricato vs non caricato;
- slice locale/area caricata vs dizionario vuoto;
- chiavi effettivamente presenti nel `Partial<Schema>` runtime vs schema completo generato.

**Unica eccezione parziale:** in multi canonical con lazy namespaces, c'è un guard runtime su `loadedNamespaces` e il metodo `hasNamespace`. Entrambi sono **inadeguati e ridondanti** (vedi §2.5). Single non ha equivalente.

### 2.4 Perché `forLocale` non risolve

`forLocale("it")` rimuove solo l'argomento `locale` da `.t()`, ma:

- non carica artifact;
- non restringe `keyof Schema` o `keyof Schema[NS]`;
- non modella namespace lazy.

È ergonomia, non safety.

### 2.5 Perché eliminare `hasNamespace` e `loadedNamespaces`

`hasNamespace(ns)` risponde solo a: _“questo namespace è stato registrato sull'engine?”_ — tramite un `Set<string>` interno (`loadedNamespaces`) aggiornato da `setNamespace` / `mergeNamespace` / chiavi del costruttore.

Il `Set` **duplica** le chiavi già presenti in `dictionary`: ogni path che aggiorna `loadedNamespaces` aggiorna anche il dizionario, e non esiste oggi uno stato “namespace nel dict ma non caricato”. Quindi `loadedNamespaces.has(ns)` ≡ `ns in dictionary`.

Non risponde a domande che contano davvero per la traduzione:

| Domanda                                             | `hasNamespace`                   | Builder + scope                                     |
| --------------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| Il namespace `billing` è caricato?                  | Sì/No                            | Implicito dopo `withNamespaces(["billing"]).load()` |
| È caricato **per la locale `it`**?                  | Non lo sa                        | `withLocale("it")` fa parte del contratto           |
| È caricato **per l'area `eu`**?                     | Non lo sa                        | `withDeliveryArea("eu")` fa parte del contratto     |
| Posso chiamare `.get("billing", …)` in type safety? | No — `get` resta su schema pieno | Sì — solo sullo scope prodotto                      |

**Esempio del difetto attuale:**

```ts
// Split-by-locale: billing caricato per "en", non per "it"
await ensureNamespacesLoadedForLocale(i18n, "en", ["billing"]);
i18n.hasNamespace("billing"); // → true
i18n.get("billing", "invoice_summary", "it", { count: 3 });
// → onMissing o stringa vuota — hasNamespace non ha protetto nulla
```

**Pattern documentato oggi che diventa obsoleto:**

```ts
if (!i18n.hasNamespace("billing")) {
  i18n.setNamespace("billing", await namespaceLoaders.billing());
}
```

Con il builder, il caricamento e il narrowing sono un unico passo:

```ts
const t = await createI18n({}).withNamespaces(["billing"]).withLocale("it").load();
// Se compila e load() risolve, billing per "it" è disponibile — nessun if manuale
```

**Decisione:**

- **Rimuovere `hasNamespace`** dalla superficie pubblica.
- **Rimuovere `loadedNamespaces`** dall'engine — unica fonte di verità: le chiavi di `dictionary`.
- **`mergeNamespace`:** il branch primo-caricamento vs merge usa `!(namespace in dictionary)` al posto del `Set`.
- **`getWithLocale` (interno):** nessun guard su namespace “caricato”; gli scope garantiscono il contesto. Un namespace assente nel dizionario degrada su `onMissing` come oggi per chiavi mancanti.

Il principio unificato diventa: **nessun controllo runtime manuale sulla disponibilità** — né `hasNamespace`, né `if` prima di `get`, né tracking parallelo al dizionario. Il builder è l'unico modo dichiarativo per ottenere uno scope traducibile; se la catena `with…` compila e `load()` completa, la risorsa c'è.

---

## 3. Proposta

### 3.1 Principi

1. **Il provider grezzo non espone traduzioni.** Nessun `.get()` / `.t()` sul tipo pubblico del motore finché non si ottiene uno scope via builder o `toScope()`.
2. **`createI18n` restituisce un builder** (lazy) o uno **scope** (eager) la cui catena descrive cosa è disponibile.
3. **Gli scope finali** espongono `t(...)` e, se locale-bound, anche `set(...)` — schema TypeScript ristretto ai generics accumulati nel builder.
4. **Nessun tracking namespace sull'engine** — né `hasNamespace`, né `loadedNamespaces`; la disponibilità è garantita dal tipo dello scope e dalle chiavi del dizionario.
5. **Codegen adatta la superficie** al `delivery` mode e a `I18N_MODE` (single/multi).

### 3.2 Esempi target (API confermata)

#### Canonical, single

```ts
const scope = createI18n(defaultDictionary);
// Scope completo: tutte le chiavi, tutte le locale del dizionario iniziale.
scope.t("welcome", "en", { name: "Ada" });
```

#### Canonical, multi, lazy namespaces

```ts
const builder = createI18n(initialDictionary); // solo namespace eager
const scope = await builder.withNamespaces(["billing", "errors"]).load();
scope.t("billing", "invoice_summary", "en", { count: 3 });
```

#### Split-by-locale, single

```ts
const builder = createI18n({});
const scope = await builder.withLocale("it").load();
scope.t("welcome", { name: "Ada" }); // locale "it" bound
```

#### Split-by-locale / custom, multi

```ts
const builder = createI18n({});
const scope = await builder.withNamespaces(["billing"]).withLocale("it").load();
scope.t("billing", "invoice_summary", { count: 3 });
```

#### Custom delivery (areas)

```ts
const builder = createI18n({});
const scope = await builder.withNamespaces(["default"]).withDeliveryArea("eu").load();
scope.t("default", "login_button", "it"); // locale esplicita su scope unbound
```

#### Patch runtime (post-preload)

```ts
const builder = createI18n({}).withNamespaces(["billing"] as const);
const enScope = await builder.withLocale("en").load();
enScope.set("billing", "invoice_summary", "You have {count} invoices");
```

### 3.3 Naming — decisioni prese

| Concetto               | Decisione                              | Note                                                  |
| ---------------------- | -------------------------------------- | ----------------------------------------------------- |
| Oggetto operativo      | **`Scope`** (`I18nScope*`)             | Non `View` — read+write nel contesto bound            |
| Proiezione engine      | **`toScope()`**                        | Engine = store interno                                |
| Caricamento async      | **`.load()` terminale**                | Esplicito, restituisce scope                          |
| Binding locale/area    | **`withLocale` / `withDeliveryArea`**  | Emessi dal codegen per delivery mode                  |
| Locale per load        | **Una partition per `load()`**         | No `withLocales([...])`; accumulo via load successive |
| Traduzione             | **`.t(...)`**                          | `get` eliminato                                       |
| Patch runtime          | **`.set(...)` su scope locale-bound**  | Non su builder; non su engine editor separato         |
| Eager canonical        | **`createI18n(dict)` → scope diretto** | Builder solo se lazy / split / custom                 |
| Hydration dati esterni | **`load()` + `scope.set()`**           | No `withNamespaceData`; no `mergeNamespace` pubblico  |

Riferimento rigoroso: [`spec-engine-scope-builder.md`](./spec-engine-scope-builder.md).

---

## 4. Modello dei tipi

### 4.1 Parametri di stato del builder

Il builder può essere modellato come un tipo con tre dimensioni:

```ts
type I18nBuilder<
  Mode extends "single" | "multi",
  LoadedNamespaces extends string, // keyof Schema (multi) o "default" (single)
  BoundLocale extends string | never,
  BoundArea extends string | never,
> = {
  /* ... */
};
```

Lo **scope traducibile** è prodotto solo quando:

| Mode                | Condizione minima per `t` type-safe                         |
| ------------------- | ----------------------------------------------------------- |
| Single canonical    | `Schema` completo passato a `createI18n`                    |
| Multi canonical     | `LoadedNamespaces` ⊇ namespace richiesto da ogni call       |
| Single split/custom | `BoundLocale` o `BoundArea` definito **e** risorsa caricata |
| Multi split/custom  | `LoadedNamespaces` **e** `BoundLocale` / `BoundArea`        |

### 4.2 Restrizione dello schema

```ts
// Multi: restringere namespace
type SchemaForNamespaces<
  Schema extends MultiDictionary,
  NS extends readonly (keyof Schema & string)[],
> = Pick<Schema, NS[number]>;

type ParamsForNamespaces<
  Params extends MultiParams,
  NS extends readonly (keyof Params & string)[],
> = Pick<Params, NS[number]>;
```

Per split-by-locale, le chiavi restano tutte quelle del namespace (il contratto ICU è per chiave, non per locale), ma:

- il **tipo dello scope** può esporre `forLocale` già bound;
- opzionalmente si può introdurre `SchemaKeyForLocale` se in futuro si vogliono chiavi presenti solo in alcune locale (oggi il codegen non modella chiavi opzionali per locale).

### 4.3 `createI18n({})` in split/custom

Oggi `InitialSchema = Pick<Schema, never> = {}` — corretto per il dizionario iniziale.

Con la proposta, il tipo di ritorno di `createI18n({})` non espone traduzioni su schema pieno. Restituisce un builder:

```ts
type EmptyI18nBuilder = I18nBuilderMulti<..., readonly []>;
// Nessun .t(); solo .withNamespaces() / .withLocale() / .withDeliveryArea() → .load()
```

Questo è il cambiamento centrale: **engine (store interno) vs scope (interfaccia pubblica read+write)**.

### 4.4 Scope, engine e singleton — decisione

**Decisione:** approccio **B** — ogni `.load()` restituisce uno scope; l’engine sottostante è mutabile e condiviso tra tutti i clone del builder.

| Aspetto         | Comportamento                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Builder `withX` | Immutabile — clona config, stesso engine                                                                       |
| `load()`        | Side effect — merge deep artifact nell’engine, ritorna scope                                                   |
| Scope           | Wrapper sottile — `t()` + `set()` (se locale-bound) delegano all’engine                                        |
| Singleton demo  | `export const builder = createI18n({})` — riusato; ogni route fa `.withNamespaces(...).withLocale(...).load()` |
| Patch runtime   | **`scope.set(...)`** sullo scope locale-bound — no engine esposto, no builder.set                              |

**Non serve** tenere un riferimento engine a module scope: il builder creato da `createI18n({})` wrappa già l’engine condiviso.

**Scope “stale”:** gli scope non sono snapshot del dizionario, ma delegano all’engine al momento della chiamata. Un patch via `enScope.set(...)` è visibile da altri scope sullo stesso engine. Documentare che il narrowing TypeScript descrive il contesto al momento del `load()`, non una immutabilità dei dati.

---

## 5. Implicazioni per delivery mode

### 5.1 Matrice comportamento proposto

| Config                 | `createI18n(...)`               | Passi builder                                      | Scope finale                               |
| ---------------------- | ------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| Single canonical       | `createI18n(defaultDictionary)` | nessuno (o `.ready()`)                             | Tutte le chiavi × tutte le locale          |
| Multi canonical eager  | `createI18n(defaultDictionary)` | nessuno                                            | Tutti i ns eager × tutte le locale         |
| Multi canonical lazy   | `createI18n(partial)`           | `withNamespaces([...]).load()`                     | Solo ns dichiarati                         |
| Single split-by-locale | `createI18n({})`                | `withLocale(l).load()`                             | Tutte le chiavi, locale `l` bound          |
| Multi split-by-locale  | `createI18n({})`                | `withNamespaces([...]).withLocale(l).load()`       | Ns × locale bound                          |
| Single custom          | `createI18n({})`                | `withDeliveryArea(a).load()`                       | Tutte le chiavi, locale implicita via area |
| Multi custom           | `createI18n({})`                | `withNamespaces([...]).withDeliveryArea(a).load()` | Ns × area                                  |

### 5.2 Cosa succede a `ensureNamespacesLoadedForLocale` / `ForArea`

| Opzione           | Decisione                                                         |
| ----------------- | ----------------------------------------------------------------- |
| **`ensure*`**     | **Rimossi** dal codegen — loader integrati nel builder            |
| **Patch runtime** | **`scope.set(...)`** post-`load()` — no `mergeNamespace` pubblico |
| **Singleton**     | Builder condiviso + `load()` per route/request                    |

Nella demo, `createI18nForLocale` / `createI18nForArea` sono sostituibili da:

```ts
// Prima
const i18n = await createI18nForLocale("it", ["billing"]);

// Dopo
const scope = await createI18n({}).withNamespaces(["billing"]).withLocale("it").load();
```

### 5.3 Canonical lazy — `withNamespaces` sync vs async

Se `withNamespaces` è solo narrowing type-safe **senza** caricamento:

```ts
const builder = createI18n(partial);
const scope = await builder.withNamespaces(["billing"]).load();
scope.t("billing", "key", "en"); // OK dopo load
```

…si ripresenta il problema. Quindi **`withNamespaces` deve implicare caricamento (async)** oppure verificare a compile-time che il namespace sia in `LoadOnInitNamespace`.

| Strategia                                  | Type safety                                |
| ------------------------------------------ | ------------------------------------------ |
| `withNamespaces` sempre async              | Forte — dopo `await load()`, chiavi pronte |
| Overload: ns eager → sync; ns lazy → async | Forte per eager; lazy obbliga await        |
| Solo narrowing                             | Debole — non raggiunge l'obiettivo         |

---

## 6. Implicazioni runtime

### 6.1 Cosa resta nell'engine (interno)

- dizionario, cache ICU, `localeFallback`, `onMissing`, preload metadata;
- `getWithLocale` interno;
- merge interno invocato solo da `load()` e da `set()` — **non** esposto come `mergeNamespace` / `mergeAll` pubblici.

### 6.2 Superficie pubblica target

| Elemento                                               | Stato target                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `I18nScope*` / `I18nScope*ForLocale`                   | Interfaccia app — `t()`, `set()` (locale-bound), `forLocale()` |
| `I18nBuilder*`                                         | Config immutabile → `load()` → scope                           |
| `toScope()`                                            | Solo per wiring avanzato / test — non pattern app              |
| `get` / `hasNamespace`                                 | **Rimossi**                                                    |
| `setAll`, `setNamespace`, `mergeAll`, `mergeNamespace` | **Rimossi**                                                    |
| `withNamespaceData`, `withDictionaryData`              | **Rimossi**                                                    |

### 6.3 Opzioni `onMissing`

Oggi passate al costruttore:

```ts
createI18n(dictionary, { onMissing: "key" });
```

Con il builder:

```ts
createI18n(dictionary, { onMissing: "key" }); // opzioni al punto di creazione engine
// oppure
createI18n(dictionary).withOptions({ onMissing: "key" });
```

Le opzioni devono essere fissate **prima** del primo `.load()` — da definire nell'API.

---

## 7. Implicazioni codegen

### 7.1 File generati impattati

| File                             | Modifica                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| `instance.generated.ts`          | `createI18n` → ritorna builder tipizzato per delivery/mode  |
| `namespace-loaders.generated.ts` | Loader integrati nel builder; `ensure*` opzionali/deprecati |
| `i18n-types.generated.ts`        | Possibili alias: `ReadySchema`, `EmptyBuilder`, ecc.        |
| Nuovo: `builder.generated.ts`?   | Se la logica fluent è troppo verbosa per `instance-file.ts` |

### 7.2 Emissione condizionale

Il codegen conosce già:

- `delivery`: `canonical` | `split-by-locale` | `custom`
- `I18N_MODE`: `single` | `multi`
- `LoadOnInitNamespace` / `LazyNamespace`

Può quindi emettere **solo i metodi sensati**:

- `withLocale` solo se `split-by-locale`
- `withDeliveryArea` solo se `custom`
- `withNamespaces` solo se `multi`

Evita API generiche con `withResource(string)` non tipizzato.

### 7.3 Compatibilità versioni

Questa è una **breaking change maggiore** (probabilmente `0.7.0` o `1.0.0`):

- rimozione `.get()`, `hasNamespace` e `loadedNamespaces`;
- rename View → Scope, `toView()` → `toScope()`;
- riformulazione demo e documentazione;
- consumatori devono migrare a scope/builder.

Si può valutare un periodo di deprecazione con:

```ts
/** @deprecated Use .withNamespaces().load() */
get(...)
```

…ma mantenere due API aumenta confusione; dato l'obiettivo esplicito di rimuovere l'API unsafe, la breaking netta è più coerente.

---

## 8. Pattern demo e casi limite

### 8.1 Singleton condiviso (`multi/src/i18n/index.ts`)

```ts
export const builder = createI18n({});
// shell: await builder.withNamespaces(["default"]).withLocale(activeLocale).load()
// route: await builder.withNamespaces(["billing"]).withLocale(activeLocale).load()
```

**Risolto (§4.4):** load successive **accumulano** (deep merge) nello stesso engine. Ogni `load()` restituisce un nuovo scope; gli scope delegano all’engine live — patch e load successivi sono visibili a tutti gli scope sullo stesso builder.

### 8.2 Istanza fresh per request (SSR)

Il builder sostituisce `createI18nForLocale` senza perdita:

```ts
export async function i18nForRequest(locale: MyProjectLocale) {
  return createI18n({}).withNamespaces(["default", "billing"]).withLocale(locale).load();
}
```

### 8.3 Patch esterne / hydration

Flusso target — niente merge pubblico, niente engine esposto:

```ts
const builder = createI18n({}).withNamespaces(["billing"] as const);
const itScope = await builder.withLocale("it").load();

// Opzione A: patch diretta (post-preload gate + re-validazione ICU)
itScope.set("billing", "invoice_summary", "Hai {count} fatture");

// Opzione B: validazione esterna per-chiave prima del set (§13)
const result = validateExternalKey("billing", "invoice_summary", rawLocales);
if (result.ok) {
  itScope.set("billing", "invoice_summary", result.data.it);
}
```

Per **patch parziali** da CMS, la validazione per-chiave (§13) sostituisce `validateExternalNamespace` full + `mergeNamespace`.

~~`engine.mergeNamespace` + `toScope()`~~ — **scartato** come pattern app: troppo farraginoso rispetto a `load()` + `scope.set()`.

### 8.4 Projection helpers

`projectNamespaceLocales`, `projectDictionaryForDeliveryArea`, ecc. restano utilità pure — ortogonali al builder. **Non** alimentano più `withNamespaceData` (eliminato); eventuali proiezioni manuali vanno validate e applicate via `scope.set()` o future API di ingest validate.

### 8.5 Single canonical — serve il builder?

Probabilmente no. `createI18n(defaultDictionary)` può restituire direttamente `I18nScope<FullSchema>` quando non ci sono lazy namespaces e il dizionario è completo.

Il builder diventa obbligatorio solo quando:

- dizionario iniziale parziale (`InitialSchema`);
- delivery split/custom;
- multi con namespace lazy.

---

## 9. Confronto con alternative scartate (o parziali)

| Alternativa                                           | Perché insufficiente                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| Solo runtime guard più aggressivi                     | TypeScript resterebbe ottimistico                                     |
| `assertNamespaceLoaded()` prima di `get`              | Boilerplate manuale, facile da dimenticare                            |
| Tenere `hasNamespace` accanto al builder              | Duplica due modelli di “disponibilità”; ignora comunque locale/area   |
| Tenere `loadedNamespaces` come guard interno          | Duplica `dictionary`; oggi non modella stati distinti                 |
| Estendere `hasNamespace` con overload per locale/area | API imperativa crescente; il builder già modella il contesto completo |
| Branded types sul provider dopo `ensure*`             | Non composable; stato non tracciato nei tipi                          |
| Parametro generico `get<NS extends LoadedNS>`         | Lo stato loaded non è nel tipo del provider oggi                      |
| Tenere `get` ma restituire `string` senza key safety  | Perdita valore della libreria                                         |

---

## 10. Rischi e trade-off

| Rischio                                                 | Mitigazione                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| API più verbosa per il caso semplice (single canonical) | Ritorno diretto dello scope senza builder                                  |
| Async obbligatorio ovunque in split/custom              | Accettabile — il caricamento è già async oggi                              |
| Complessità generics / errori TS illeggibili            | Alias codegen, limitare profondità del builder                             |
| Scope stale su singleton mutabile                       | Gli scope delegano all’engine live; documentare semantica read-after-write |
| Framework bindings (React context)                      | Esportare tipo scope stabile, non engine                                   |
| Migrazione costosa                                      | Guide per ogni delivery mode nella demo                                    |

---

## 11. Piano di sviluppo

> **Nota processo:** le fasi 1–3 e parte della 4 sono state implementate in codice **prima** del completamento di questo documento. Da qui in avanti: **allineare l’analisi e la spec, poi proseguire con ciò che manca** (es. `set()`, preload gate, rimozione merge pubblici).

### Fase 0 — Design freeze (questo documento + spec)

- [x] Naming: **`Scope`**, `toScope()`, `t()` — §1.1, §3.3
- [x] `withLocale` / `withDeliveryArea` (no `withResource`)
- [x] Una partition per `load()` (no `withLocales`)
- [x] Read+write unificati su scope locale-bound (no engine editor)
- [x] Rimuovere merge/replace pubblici — target §6.2
- [x] Eliminare `hasNamespace` e `loadedNamespaces` — §2.5
- [x] Spec rigorosa — [`spec-engine-scope-builder.md`](./spec-engine-scope-builder.md)
- [ ] Design freeze formale approvato

### Fase 1 — Tipi e scope (runtime)

- [x] `I18nScope*` / `I18nScope*ForLocale` con `t()` ristretto
- [x] `toScope()` su engine
- [x] Test unitari scope — `scope.test.ts`
- [ ] **`set()`** su scope locale-bound + preload gate + re-validazione ICU
- [ ] Rimuovere `get` / tipi provider legacy dalla superficie pubblica

### Fase 2 — Builder (runtime)

- [x] `I18nBuilder*` con `withNamespaces`, `withLocale`, `withDeliveryArea`, `load()`
- [x] Integrazione loader (injection via codegen)
- [ ] Rimuovere `withNamespaceData` / `withDictionaryData`

### Fase 3 — Codegen

- [x] `createI18n` → builder/scope secondo config
- [x] `namespaceLoaders` nel builder; `ensure*` rimossi
- [x] Test codegen aggiornati
- [ ] Emettere tipi scope con `set()` quando locale-bound

### Fase 3b — Validazione per-chiave

- [ ] `validateExternalKey` / `validateExternalNamespacePartial` (§13)
- [ ] Demo patch CMS validate → `scope.set()`

### Fase 4 — Demo e docs

- [x] Demo su builder esplicito (parziale)
- [ ] Rimuovere resti `mergeNamespace` in demo
- [ ] README allineato a scope + `set()`
- [ ] Blog post

### Fase 5 — Release 0.7.0

- [x] CHANGELOG breaking (parziale — rename Scope)
- [ ] Migration guide completa
- [ ] Bump versione dopo `set()` + rimozione merge pubblici

---

## 12. Domande aperte / risolte

| #   | Domanda                                         | Stato       | Risposta                                                                                                                         |
| --- | ----------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Builder vs engine mutabile                      | **Risolto** | Builder immutabile che wrappa engine condiviso (§4.4)                                                                            |
| 2   | Single canonical ritorna scope?                 | **Risolto** | Sì — `createI18n(dict)` → `I18nScopeSingle` via `toScope()`                                                                      |
| 3   | Multi canonical eager — serve `withNamespaces`? | **Risolto** | No — scope pieno; `withNamespaces` solo per lazy                                                                                 |
| 4   | `get` o `t`?                                    | **Risolto** | **`t`**                                                                                                                          |
| 5   | Hydration / patch                               | **Risolto** | **`scope.set()`** post-`load()` — no engine esposto, no merge pubblico                                                           |
| 6   | View o Scope?                                   | **Risolto** | **`Scope`**                                                                                                                      |
| 7   | `forLocale` vs `toScope({ locale })`            | **Risolto** | Entrambi: `toScope({ locale })` su engine; `forLocale` su scope unbound; `load()` dopo `withLocale` restituisce già locale-bound |
| 8   | `withLocales([...])`?                           | **Risolto** | **No** — una partition per load; accumulo via load successive                                                                    |
| 9   | `forNamespace` narrowing?                       | **Aperto**  | Non previsto in v1 — namespace già ristretto da `withNamespaces`                                                                 |
| 10  | Validazione per-chiave                          | **Aperto**  | Opzione A (API dedicate) preferita — §13                                                                                         |
| 11  | Versioning                                      | **Aperto**  | `0.7.0` breaking probabile                                                                                                       |

---

## 13. Validazione esterna per-chiave (analisi)

### 13.1 Problema attuale: validazione “all or nothing”

La validazione esterna (`@xndrjs/i18n/validation`, wrappers codegen in `dictionary-schema.generated.ts`) è modellata come **controllo del payload completo rispetto al contratto generato**:

| Fase               | Cosa fa                                                                                                | File                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Normalize**      | Per ogni chiave in `DICTIONARY_SPEC.requiredKeys`, verifica presenza, shape locale→template, parse ICU | `normalize.ts` → `normalizeKeyDictionary` |
| **Validate (Zod)** | Schema Zod con **tutte** le chiavi del namespace obbligatorie                                          | `create-normalized-schema.ts`             |
| **Output**         | Dizionario tipizzato completo (`Schema` o `Schema[NS]`)                                                | `toDictionary` / `toNamespaceDictionary`  |

Il loop decisivo è in `normalizeKeyDictionary`:

```ts
for (const key of requiredKeys) {
  if (!(key in input)) {
    issues.push({ kind: "missing_key", path: [...keyPathPrefix, key] });
  }
  // ...
}
```

`validateExternalNamespace` non cambia il modello: wrappa l'input in `{ [namespace]: input }` e riusa lo stesso spec con **tutte** le `requiredKeys` di quel namespace.

**Conseguenza:** un payload parziale fallisce sempre, anche se ogni chiave presente è corretta.

```ts
// Spec richiede: welcome, login_button, dashboard_status, …
validateExternalNamespace("default", {
  welcome: { en: "Welcome {name}!" },
});
// → { kind: "missing_key", path: ["default", "login_button"] }, …
```

Questo è in tensione con:

- **`mergeNamespace` / `mergeAll`** — progettati per accumulare slice (locale, area, namespace) sull'engine;
- **`projectNamespaceLocales`** — già usato per patch parziali **senza** validazione;
- **CMS / webhook delta** — tipicamente inviano solo le chiavi modificate;
- **split-by-locale** — ogni artifact JSON contiene un sottoinsieme di chiavi×locale rispetto al canonico.

Oggi i flussi “patch parziale” nella demo aggirano il problema in due modi:

1. **Senza validazione** — `projectNamespaceLocales(billing, ["it"])` poi `mergeNamespace` (§8.3, `exampleProjectNamespaceLocalesPatch`);
2. **Con validazione full** — caricare l'intero namespace da `namespaceLoaders` e validare tutto prima del merge (`exampleExternalNamespacePatch`).

Manca un percorso intermedio: **validare solo ciò che si sta per mergiare**.

### 13.2 Proposta concettuale: invertire il loop

| Oggi (spec-driven)                                              | Proposto (input-driven)                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| Per ogni chiave **nel contratto**, verifica che sia nel payload | Per ogni chiave **nel payload**, verifica che sia nel contratto |
| Output: namespace/dizionario **completo**                       | Output: namespace/dizionario **parziale** (`Partial<…>`)        |
| Adatto a hydration “sostituisci tutto”                          | Adatto a merge incrementale                                     |

```ts
// Concettuale — non API finale
for (const key of Object.keys(input)) {
  if (!(key in spec.argsByKey[namespace])) {
    issues.push({ kind: "unknown_key", path: [namespace, key] });
    continue;
  }
  validateKey(key, input[key], spec.argsByKey[namespace][key]);
}
```

**Mental model:** _“per ogni chiave di questo dictionary runtime, valida questa chiave”_ — non _“valida tutte le chiavi del contratto contro questo dictionary”_.

### 13.3 Livelli di granularità

| Livello                                    | Input                                                 | Caso d'uso                        | Complessità                                                                              |
| ------------------------------------------ | ----------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| **L1 — chiavi parziali nel namespace**     | `{ welcome: { en: "…" }, login_button: { en: "…" } }` | CMS delta, merge di N chiavi      | Bassa — estensione naturale di `normalizeKeyDictionary`                                  |
| **L2 — singola chiave**                    | `"welcome"`, `{ en: "Welcome {name}!" }`              | Webhook per chiave, hotfix        | Bassa — wrapper su L1                                                                    |
| **L3 — locale parziali per chiave**        | `{ welcome: { it: "…" } }` (solo `it`)                | Split-by-locale, patch monolingua | Media — oggi coperto da projection senza validazione; merge già supporta locale parziali |
| **L4 — namespace parziali nel dizionario** | `{ billing: { … } }` senza `default`                  | Hydration multi-ns incrementale   | Bassa — analogo a L1 a livello namespace                                                 |

**Raccomandazione preliminare:** partire da **L1 + L2** (per-chiave / namespace parziale). **L3** è già compatibile con `mergeNamespace` se la validazione per-chiave accetta `Record<locale, string>` con un solo locale — non richiede tutte le locale del contratto, solo coerenza ICU **tra le locale presenti in quella chiave** (come oggi in `mergeVariableMetaAcrossLocales`).

### 13.4 API ipotizzate

#### Opzione A — funzioni dedicate (preferita)

```ts
// Multi — solo le chiavi presenti in input
validateExternalNamespacePartial<NS>(namespace, input): ValidationResult<Partial<Schema[NS]>>

// Multi — una chiave
validateExternalKey<NS, K>(namespace, key, input): ValidationResult<Pick<Schema[NS], K>>

// Single — analogo
validateExternalDictionaryPartial(input): ValidationResult<Partial<Schema>>
validateExternalKey<K>(key, input): ValidationResult<Pick<Schema, K>>
```

`validateExternalDictionary` / `validateExternalNamespace` **restano** per hydration full (CMS snapshot completo, audit).

#### Opzione B — flag su API esistenti

```ts
validateExternalNamespace("billing", raw, { mode: "partial" });
```

Menù API più piccolo, ma overload e tipi di ritorno condizionali (`Schema[NS]` vs `Partial<Schema[NS]>`) sono più fragili in TypeScript.

#### Opzione C — normalize/validate a basso livello

Esporre `normalizeKeyDictionary` / `validateKeyEntry` nel public API di `@xndrjs/i18n/validation`; i wrapper codegen restano sottili.

Utile per tooling; per i consumatori l'opzione A è più chiara.

### 13.5 Tipi di ritorno e type safety

| API                                         | Tipo successo                        | Compatibilità con `mergeNamespace`                                       |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `validateExternalNamespace` (oggi)          | `Schema[NS]`                         | `mergeNamespace(ns, data)` — ok                                          |
| `validateExternalNamespacePartial`          | `Partial<Schema[NS]>`                | `mergeNamespace(ns, data)` — **già ok** (`mergeNamespace` accetta slice) |
| `validateExternalKey<"billing", "welcome">` | `Pick<Schema["billing"], "welcome">` | Idem                                                                     |

`mergeNamespace` e `mergeAll` fanno merge per chiave/locale — non richiedono namespace completi. Il gap è solo lato **validazione in ingresso**, non lato engine.

Per il **builder** (§8.3):

```ts
const result = validateExternalKey("billing", "invoice_summary", rawLocales);
if (result.ok) {
  itScope.set("billing", "invoice_summary", result.data.it!);
}
```

### 13.6 Regole di validazione da definire

| Regola                                      | Proposta                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Chiave nel payload ma **non nel contratto** | `unknown_key` — fallisce (protegge da typo CMS)                                                |
| Chiave nel contratto ma **non nel payload** | OK in modalità partial — non è un errore                                                       |
| Payload `{}`                                | OK — no-op merge; utile come guard prima di skip                                               |
| Chiave con **zero locale**                  | `invalid_input` — almeno una locale per chiave validata                                        |
| ICU args **tra locale della stessa chiave** | Stessa regola di oggi (`locale_args_mismatch`) — ma solo sulle locale **presenti** nel payload |
| Validazione args vs **contratto**           | Invariata — `mergedArgs` deve matchare `spec.argsByKey[ns][key]`                               |

### 13.7 Cosa non cambia

- **`DICTIONARY_SPEC`** — resta la fonte di verità; `requiredKeys` serve ancora per la modalità full e per audit;
- **Fase Zod** — si può validare per-chiave con `createKeyDictionarySchema` ristretto alle chiavi in input, senza richiedere l'intero object schema;
- **Validazione full** — resta il default per ingestion “snapshot completo”; la partial è opt-in.

### 13.8 Implicazioni implementative

| Area                        | Lavoro                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `normalize.ts`              | `normalizeKeyDictionaryPartial(input, argsByKey, path)` — loop su `Object.keys(input)` |
| `validate-normalized.ts`    | `validateNormalizedKeyDictionary` — Zod su subset                                      |
| `validation/index.ts`       | `validateExternalKey`, `validateExternalNamespacePartial`, …                           |
| `dictionary-schema-file.ts` | Wrapper codegen tipizzati con `Schema` / `Params` del progetto                         |
| Test                        | Casi: singola chiave ok; chiave sconosciuta; partial + merge; convivenza con full      |
| Demo                        | `examplePartialKeyPatch` — valida una chiave, merge, senza `projectNamespaceLocales`   |

**Stima:** ~1–2 giorni, ortogonale al builder — può essere una release patch/minor indipendente (`0.6.x` o `0.7.0`) prima o in parallelo alla Fase 1–3 del builder.

### 13.9 Rischi

| Rischio                                                             | Mitigazione                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Due modalità (full vs partial) confuse                              | Naming esplicito (`Partial` / `Key` nel nome); documentazione con matrice “quando usare cosa”                      |
| CMS invia chiave valida ma dimentica altre obbligatorie per la view | Responsabilità del builder/scope — partial non garantisce namespace completo; lo scope espone solo chiavi caricate |
| `unknown_key` vs chiavi future del contratto                        | Solo chiavi presenti in `DICTIONARY_SPEC` al momento del codegen sono “note”; altre → errore                       |
| Duplicazione logica normalize                                       | Estrarre `normalizeSingleKey` condiviso da full e partial                                                          |

### 13.10 Relazione con il builder

I due lavori sono **complementari**:

| Builder / scope                                                      | Validazione per-chiave                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| _“Posso tradurre/patchare questa chiave?”_ — compile-time, post-load | _“Questo payload esterno è sicuro?”_ — runtime, pre-`set()` |
| Scope ristretti dopo `with…().load()`                                | `validateExternalKey` prima di `scope.set()`                |

Flusso target per patch CMS:

```ts
const builder = createI18n({}).withNamespaces(["billing"] as const);
const itScope = await builder.withLocale("it").load();

const delta = await fetchCmsDelta();
for (const [key, locales] of Object.entries(delta.billing ?? {})) {
  const result = validateExternalKey("billing", key, locales);
  if (result.ok) itScope.set("billing", key as keyof typeof delta.billing, locales.it!);
}
```

---

## 14. Conclusione

La modifica è **coerente con il posizionamento “compiler-first”** della libreria: oggi il compilatore promette più di quanto il runtime possa garantire appena si esce dal caso canonical eager.

Stesso ragionamento per la validazione esterna (§13): oggi il contratto è **spec-driven** (tutte le chiavi obbligatorie); per merge parziali serve un percorso **input-driven** (valida solo ciò che arriva).

Il costo principale non è il formatting ICU (invariato), ma:

- una **riformulazione del contratto TypeScript** (engine interno vs **scope** pubblico);
- **codegen condizionale** per delivery mode;
- **breaking change** deliberata: `get` → `t`, View → Scope, rimozione merge/replace pubblici;
- **`set()`** con preload gate (da implementare).

Il beneficio è un modello mentale chiaro:

> _Non chiami `t` su un dizionario che non hai ancora caricato. Costruisci uno scope con `with…`, attendi `load()`, traduci e — se serve — patchi con `set` sullo stesso scope. Se compila e il preload gate passa, la risorsa c’è._

**Prossimo passo:** approvare design freeze (§11 Fase 0), poi implementare `set()` + rimozione API merge/replace — **solo dopo** chiusura analisi.
