# Analisi: API fluent e type-safety su `get`

**Data:** 2026-07-13  
**Scope:** `@xndrjs/i18n` (runtime + codegen)  
**Stato:** bozza per discussione — nessuna implementazione ancora pianificata in dettaglio

---

## 1. Sintesi

L'API attuale espone `.get()` su un provider il cui schema TypeScript rappresenta **l'intero contratto del progetto** (tutte le chiavi, tutti i namespace, tutte le locale), indipendentemente da cosa è effettivamente caricato a runtime.

Questo crea un divario sistematico tra **type safety compile-time** e **garanzie runtime**: TypeScript suggerisce chiavi e locale sempre disponibili, ma in molte configurazioni di delivery la traduzione può fallire (namespace non caricato) o risolversi con `onMissing` (chiave/locale assente nel dizionario parziale).

La proposta è di:

1. **Rimuovere o radicalmente ridurre** `.get()` sul provider “grezzo”.
2. Far restituire a `createI18n` un **builder fluent** che produce **view type-safe** solo quando risorsa e namespace sono noti.
3. **Eliminare `hasNamespace` e il `Set` interno `loadedNamespaces`** — ridondanti con le chiavi del dizionario; sostituiti dal builder.
4. Nella demo, eliminare `createI18nForArea` / `createI18nForLocale` a favore del builder.
5. **Valutare validazione esterna per-chiave** — oggi all-or-nothing; serve per merge parziali (§13).

Obiettivo: allineare il contratto TypeScript alle garanzie runtime — _se compila, la risorsa/chiave è pronta_.

---

## 2. Stato attuale

### 2.1 Superficie API rilevante

| Elemento                                    | Dove                              | Ruolo                                                           |
| ------------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| `createI18n(dictionary, options?)`          | `instance.generated.ts` (codegen) | Factory → `IcuTranslationProviderSingle` o `Multi`              |
| `.get(key, locale, params?)`                | Single                            | Traduzione type-safe su **tutto** `Schema`                      |
| `.get(ns, key, locale, params?)`            | Multi                             | Idem su **tutti** i namespace di `Schema`                       |
| `.forLocale(locale)`                        | Entrambi                          | View con locale fissato; **nessun restringimento** sulle chiavi |
| `hasNamespace` / `loadedNamespaces`         | Multi                             | Tracking namespace caricato — **da eliminare** (vedi §2.5)      |
| `setNamespace` / `mergeNamespace`           | Multi                             | Gestione namespace lazy (restano sull'engine, non sulla view)   |
| `ensureNamespacesLoadedForLocale`           | Codegen (split-by-locale)         | Carica artifact per locale, merge sull'istanza                  |
| `ensureNamespacesLoadedForArea`             | Codegen (custom delivery)         | Idem per delivery area                                          |
| `createI18nForLocale` / `createI18nForArea` | Demo (`multi`, `areas`)           | `createI18n({})` + ensure + return                              |

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

`forLocale("it")` rimuove solo l'argomento `locale` da `.get()`, ma:

- non carica artifact;
- non restringe `keyof Schema` o `keyof Schema[NS]`;
- non modella namespace lazy.

È ergonomia, non safety.

### 2.5 Perché eliminare `hasNamespace` e `loadedNamespaces`

`hasNamespace(ns)` risponde solo a: _“questo namespace è stato registrato sull'engine?”_ — tramite un `Set<string>` interno (`loadedNamespaces`) aggiornato da `setNamespace` / `mergeNamespace` / chiavi del costruttore.

Il `Set` **duplica** le chiavi già presenti in `dictionary`: ogni path che aggiorna `loadedNamespaces` aggiorna anche il dizionario, e non esiste oggi uno stato “namespace nel dict ma non caricato”. Quindi `loadedNamespaces.has(ns)` ≡ `ns in dictionary`.

Non risponde a domande che contano davvero per la traduzione:

| Domanda                                             | `hasNamespace`                   | Builder + view                                      |
| --------------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| Il namespace `billing` è caricato?                  | Sì/No                            | Implicito dopo `withNamespaces(["billing"]).load()` |
| È caricato **per la locale `it`**?                  | Non lo sa                        | `withLocale("it")` fa parte del contratto           |
| È caricato **per l'area `eu`**?                     | Non lo sa                        | `withDeliveryArea("eu")` fa parte del contratto     |
| Posso chiamare `.get("billing", …)` in type safety? | No — `get` resta su schema pieno | Sì — solo sulla view prodotta                       |

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
- **`getWithLocale` (interno):** nessun guard su namespace “caricato”; le view garantiscono il contesto. Un namespace assente nel dizionario degrada su `onMissing` come oggi per chiavi mancanti.

Il principio unificato diventa: **nessun controllo runtime manuale sulla disponibilità** — né `hasNamespace`, né `if` prima di `get`, né tracking parallelo al dizionario. Il builder è l'unico modo dichiarativo per ottenere una view traducibile; se la catena `with…` compila e `load()` completa, la risorsa c'è.

---

## 3. Proposta

### 3.1 Principi

1. **Il provider grezzo non espone traduzioni.** Nessun `.get()` (o equivalente) finché non si dichiara esplicitamente contesto (namespace, locale/area).
2. **`createI18n` restituisce un builder** la cui catena descrive cosa è (o sarà) disponibile.
3. **Le view finali** espongono una funzione di traduzione (`get` o `t`) il cui schema TypeScript è un **sottoinsieme** del contratto globale, derivato dai generics accumulati nel builder.
4. **Nessun tracking namespace sull'engine** — né `hasNamespace`, né `loadedNamespaces`; la disponibilità è garantita dal tipo della view e dalle chiavi del dizionario.
5. **Codegen adatta la superficie** al `delivery` mode e a `I18N_MODE` (single/multi).

### 3.2 Esempi target (dalla proposta)

#### Canonical, single

```ts
const i18n = createI18n(defaultDictionary);
// View completa: tutte le chiavi, tutte le locale del dizionario iniziale.
const t = i18n.ready(); // o il builder è già “ready” senza passi aggiuntivi
t.get("welcome", "en", { name: "Ada" });
```

#### Canonical, multi, lazy namespaces

```ts
const i18n = createI18n(initialDictionary); // solo namespace eager
const t = await i18n.withNamespaces(["billing", "errors"]).load();
// t.get: solo chiavi di billing + errors, tutte le locale del progetto
t.get("billing", "invoice_summary", "en", { count: 3 });
```

#### Split-by-locale, single

```ts
const i18n = createI18n({}); // nessuna chiave, nessuna locale nel tipo
const t = await i18n.withResource("it").load();
t.get("welcome", { name: "Ada" }); // locale "it" già bound
```

#### Split-by-locale / custom, multi

```ts
const i18n = createI18n({});
const t = await i18n
  .withNamespaces(["billing"])
  .withResource("it") // oppure .withResource("billing", "it")
  .load();
t.get("billing", "invoice_summary", { count: 3 });
```

#### Custom delivery (areas)

```ts
const i18n = createI18n({});
const t = await i18n.withNamespaces(["default"]).withResource("eu").load();
```

### 3.3 Naming — opzioni da decidere

| Concetto            | Opzione A                       | Opzione B                                                    | Note                                                            |
| ------------------- | ------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| Caricamento async   | `.load()` terminale             | builder `async` (thenable)                                   | `.load()` è più esplicito                                       |
| Binding locale/area | `withResource("it")`            | `withLocale("it")` / `withDeliveryArea("eu")`                | Nome unico vs nomi codegen-specifici                            |
| Multi ns + resource | `withResource("billing", "it")` | `withResource("billing.it")`                                 | Due argomenti è più type-safe                                   |
| Funzione traduzione | `.get(...)` sulle view          | `.t(...)`                                                    | Coerenza con ecosistema React; `get` resta sulle view ristrette |
| Stato “già pronto”  | `i18n.ready()` / identity       | `createI18n` ritorna direttamente la view se canonical eager | Meno builder quando non serve                                   |

**Raccomandazione preliminare:** `withLocale` / `withDeliveryArea` emessi dal codegen in base a `delivery`, più `withNamespaces` per multi. Evitare stringhe composite `"billing.it"` — due parametri tipizzati separano meglio i concern.

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

La **view traducibile** è prodotta solo quando:

| Mode                | Condizione minima per `get` type-safe                       |
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

- il **tipo della view** può esporre `forLocale` già bound;
- opzionalmente si può introdurre `SchemaKeyForLocale` se in futuro si vogliono chiavi presenti solo in alcune locale (oggi il codegen non modella chiavi opzionali per locale).

### 4.3 `createI18n({})` in split/custom

Oggi `InitialSchema = Pick<Schema, never> = {}` — corretto per il dizionario iniziale.

Con la proposta, il tipo di ritorno di `createI18n({})` non deve implementare `TranslationProvider*` con `.get()` su schema pieno. Propone invece:

```ts
type EmptyI18nBuilder = I18nBuilder<..., never, never, never>;
// Nessun metodo .get(); solo .withResource() / .withNamespaces()
```

Questo è il cambiamento più importante: **separare il tipo “motore” (mutabile, merge, cache) dal tipo “view” (solo lettura traduzioni)**.

### 4.4 View immutabili vs istanza mutabile

Due approcci:

| Approccio                                          | Pro                                                                      | Contro                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **A. View wrapper** (come `ForLocale` oggi)        | Provider interno invariato; `mergeNamespace` resta sull'istanza “engine” | Due riferimenti (engine + view); rischio di usare view stale dopo merge |
| **B. Builder produce nuova view a ogni `.load()`** | View sempre coerente col caricamento                                     | Singleton condiviso più complesso da modellare                          |

Per il pattern **singleton condiviso** della demo `multi` (`export const i18n = createI18n({})`), serve decidere se:

- il builder è monouso (`load()` → view, engine non esposto);
- oppure `i18n.withNamespaces(...).load()` aggiorna l'engine e restituisce una nuova view (invalidazione esplicita).

---

## 5. Implicazioni per delivery mode

### 5.1 Matrice comportamento proposto

| Config                 | `createI18n(...)`               | Passi builder                                      | View finale                                |
| ---------------------- | ------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| Single canonical       | `createI18n(defaultDictionary)` | nessuno (o `.ready()`)                             | Tutte le chiavi × tutte le locale          |
| Multi canonical eager  | `createI18n(defaultDictionary)` | nessuno                                            | Tutti i ns eager × tutte le locale         |
| Multi canonical lazy   | `createI18n(partial)`           | `withNamespaces([...]).load()`                     | Solo ns dichiarati                         |
| Single split-by-locale | `createI18n({})`                | `withLocale(l).load()`                             | Tutte le chiavi, locale `l` bound          |
| Multi split-by-locale  | `createI18n({})`                | `withNamespaces([...]).withLocale(l).load()`       | Ns × locale bound                          |
| Single custom          | `createI18n({})`                | `withDeliveryArea(a).load()`                       | Tutte le chiavi, locale implicita via area |
| Multi custom           | `createI18n({})`                | `withNamespaces([...]).withDeliveryArea(a).load()` | Ns × area                                  |

### 5.2 Cosa succede a `ensureNamespacesLoadedForLocale` / `ForArea`

| Opzione                     | Descrizione                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Deprecare**               | Il builder chiama internamente gli stessi loader; gli `ensure*` diventano helper interni o vengono rimossi dalla superficie pubblica |
| **Mantenere per hydration** | `engine.mergeNamespace` + validazione esterna restano per patch runtime; le view si ricreano dopo patch                              |
| **Ibrido**                  | `engine.load({ locale, namespaces })` imperativo per singleton; builder per istanze fresh                                            |

Nella demo, `createI18nForLocale` / `createI18nForArea` sono sostituibili da:

```ts
// Prima
const i18n = await createI18nForLocale("it", ["billing"]);

// Dopo
const t = await createI18n({}).withNamespaces(["billing"]).withLocale("it").load();
```

### 5.3 Canonical lazy — `withNamespaces` sync vs async

Se `withNamespaces` è solo narrowing type-safe **senza** caricamento:

```ts
const i18n = createI18n(partial);
const t = i18n.withNamespaces(["billing"]); // compile-time OK
t.get("billing", "key", "en"); // runtime throw se non caricato
```

…si ripresenta il problema. Quindi **`withNamespaces` deve implicare caricamento (async)** oppure verificare a compile-time che il namespace sia in `LoadOnInitNamespace`.

| Strategia                                  | Type safety                                |
| ------------------------------------------ | ------------------------------------------ |
| `withNamespaces` sempre async              | Forte — dopo `await load()`, chiavi pronte |
| Overload: ns eager → sync; ns lazy → async | Forte per eager; lazy obbliga await        |
| Solo narrowing                             | Debole — non raggiunge l'obiettivo         |

---

## 6. Implicazioni runtime

### 6.1 Cosa resta nel provider

Il motore (`IcuTranslationProviderSingle` / `Multi`) può restare quasi invariato:

- dizionario, cache ICU, `mergeNamespace`, `localeFallback`, `onMissing`;
- `getWithLocale` interno (non esposto nel tipo pubblico “grezzo”);
- **semplificazione multi:** rimozione di `loadedNamespaces` e del guard associato in `getWithLocale`.

Il lavoro principale è su **interfacce pubbliche** e **codegen**, non sulla logica di formatting.

### 6.2 Cosa cambia nel provider

| Cambiamento                                                 | Necessità                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| Rimuovere `get` da `TranslationProviderMulti/Single`        | Sì, breaking                                                  |
| Rimuovere `hasNamespace`                                    | Sì, breaking — sostituito dal builder                         |
| Rimuovere `loadedNamespaces` (`Set` interno)                | Sì — ridondante con `dictionary`; semplifica `mergeNamespace` |
| Nuove classi `I18nBuilder`, `I18nView`, `I18nViewForLocale` | Sì                                                            |
| `forLocale` sul provider grezzo                             | Probabilmente si sposta sulle view                            |

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

- rimozione `.get()`, `hasNamespace` e `loadedNamespaces` dal provider multi;
- riformulazione demo e documentazione (inclusi pattern `if (!hasNamespace)` nel README);
- blog post i18n da aggiornare;
- consumatori devono migrare a view/builder.

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
export const i18n = createI18n({});
// shell: await i18n.withNamespaces(["default"]).withLocale(activeLocale).load()
// route: await i18n.withNamespaces(["billing"]).withLocale(activeLocale).load()
```

**Questione aperta:** il secondo `load()` sullo stesso engine — merge o replace?

- Oggi `mergeNamespace` **accumula** locale (0.6.1).
- Le view precedenti potrebbero riferire uno snapshot type-safe non più valido se si aggiungono namespace.

**Proposta:** ogni `.load()` restituisce una nuova view; l'engine è mutabile; documentare che le view non vanno tenute oltre cambi di contesto.

### 8.2 Istanza fresh per request (SSR)

Il builder sostituisce `createI18nForLocale` senza perdita:

```ts
export async function i18nForRequest(locale: MyProjectLocale) {
  return createI18n({}).withNamespaces(["default", "billing"]).withLocale(locale).load();
}
```

### 8.3 Patch esterne / hydration

Esempi demo che usano `validateExternalNamespace` + `mergeNamespace`:

```ts
const validated = validateExternalNamespace("billing", raw);
engine.mergeNamespace("billing", validated);
const t = engine.view({ namespaces: ["billing"], locale: "it" });
```

Il builder da solo non copre il flusso “dato già in mano”. Serve:

- `engine.mergeNamespace` (o `withDictionary(ns, dict)`) **+** `toView(...)`;
- oppure `builder.withNamespaceData("billing", validated).withLocale("it")`.

Per **patch parziali** (solo alcune chiavi), la validazione full è oggi un ostacolo — vedi **§13** (`validateExternalKey` / `validateExternalNamespacePartial`).

Da includere nella API engine, non necessariamente nel builder principale.

### 8.4 Projection helpers

`projectNamespaceLocales`, `projectDictionaryForDeliveryArea`, ecc. restano utilità pure — ortogonali al builder. Possono alimentare `withNamespaceData`.

### 8.5 Single canonical — serve il builder?

Probabilmente no. `createI18n(defaultDictionary)` può restituire direttamente `I18nView<FullSchema>` quando non ci sono lazy namespaces e il dizionario è completo.

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

| Rischio                                                 | Mitigazione                                      |
| ------------------------------------------------------- | ------------------------------------------------ |
| API più verbosa per il caso semplice (single canonical) | Ritorno diretto della view senza builder         |
| Async obbligatorio ovunque in split/custom              | Accettabile — il caricamento è già async oggi    |
| Complessità generics / errori TS illeggibili            | Alias codegen, limitare profondità del builder   |
| View stale su singleton mutabile                        | Documentazione + `toView()` esplicito dopo merge |
| Framework bindings (React context)                      | Esportare tipo view stabile, non engine          |
| Migrazione costosa                                      | Guide per ogni delivery mode nella demo          |

---

## 11. Piano di sviluppo proposto (bozza)

### Fase 0 — Design freeze (questo documento)

- [ ] Decidere naming (`withLocale` vs `withResource`)
- [ ] Decidere sync/async per canonical lazy
- [ ] Decidere destino di `ensure*` e `forLocale`
- [ ] Decidere modello singleton vs fresh instance
- [x] Eliminare `hasNamespace` e `loadedNamespaces` — confermato (§2.5)

### Fase 1 — Tipi e view (runtime)

- [ ] Introdurre `I18nEngine` (ex provider, senza `get`, `hasNamespace`, né `loadedNamespaces`)
- [ ] Introdurre `I18nView` / `I18nViewForLocale` con `get` ristretto
- [ ] Test unitari view + engine separati
- [ ] Nessun cambio codegen ancora — test con tipi manuali

### Fase 2 — Builder (runtime)

- [ ] `I18nBuilder` con `withNamespaces`, `withLocale`, `withDeliveryArea`, `load()`
- [ ] Integrazione con loader (callback injection per non accoppiare runtime a codegen)

### Fase 3 — Codegen

- [ ] Emettere `createI18n` → builder/view secondo config
- [ ] Integrare `namespaceLoaders` nel builder
- [ ] Deprecare/rimuovere `ensure*` dalla superficie pubblica
- [ ] Aggiornare test codegen

### Fase 3b — Validazione per-chiave (opzionale, parallela o precedente al builder)

- [ ] `normalizeKeyDictionaryPartial` + `validateExternalKey` / `validateExternalNamespacePartial`
- [ ] Wrapper codegen in `dictionary-schema.generated.ts`
- [ ] Demo `examplePartialKeyPatch`
- [ ] Documentare matrice full vs partial

### Fase 4 — Demo e docs

- [ ] Rimuovere `createI18nForLocale` / `createI18nForArea`
- [ ] Aggiornare `apps/i18n-demo/*`
- [ ] Aggiornare README package
- [ ] Aggiornare blog post documentazione

### Fase 5 — Release

- [ ] CHANGELOG breaking
- [ ] Bump minor/major
- [ ] Migration guide

**Stima indicativa:** Fase 1–2 runtime ~2–3 giorni; Fase 3 codegen ~2–3 giorni; Fase 4 demo/docs ~1–2 giorni (dipende da decisioni Fase 0).

---

## 12. Domande aperte per la prossima sessione

1. **Il builder è lo stesso oggetto mutabile dell'engine**, o `createI18n` restituisce un builder che wrappa un engine interno?
2. **Single canonical:** `createI18n(dict)` ritorna direttamente la view — confermato?
3. **Multi canonical con tutti i namespace eager:** serve `withNamespaces` o la view è già piena?
4. **Nome della funzione di traduzione** sulle view: `get` o `t`?
5. **Hydration / merge manuale:** `engine.merge` + `engine.toView(...)` è sufficiente?
6. **Versioning:** `0.7.0` con breaking o attendere `1.0.0`?
7. **`forLocale` sulle view multi:** `view.forNamespace("billing")` ha senso come ulteriore narrowing?
8. **Validazione per-chiave:** API unica `validateExternalKey` vs flag `partial` su `validateExternalNamespace`? (vedi §14)

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
const key = validateExternalKey("billing", "invoice_summary", raw);
if (key.ok) {
  engine.mergeNamespace("billing", key.data);
  // oppure: builder.withNamespaceData("billing", key.data).withLocale("it").toView()
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

| Rischio                                                             | Mitigazione                                                                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Due modalità (full vs partial) confuse                              | Naming esplicito (`Partial` / `Key` nel nome); documentazione con matrice “quando usare cosa”                    |
| CMS invia chiave valida ma dimentica altre obbligatorie per la view | Responsabilità del builder/view — partial non garantisce namespace completo; la view espone solo chiavi caricate |
| `unknown_key` vs chiavi future del contratto                        | Solo chiavi presenti in `DICTIONARY_SPEC` al momento del codegen sono “note”; altre → errore                     |
| Duplicazione logica normalize                                       | Estrarre `normalizeSingleKey` condiviso da full e partial                                                        |

### 13.10 Relazione con il builder

I due lavori sono **complementari**:

| Builder                                                     | Validazione per-chiave                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| _“Posso tradurre questa chiave?”_ — compile-time, post-load | _“Questo payload esterno è sicuro da mergiare?”_ — runtime, pre-merge |
| View ristrette dopo `with…().load()`                        | `validateExternalKey` prima di `mergeNamespace` / `withNamespaceData` |

Flusso target per patch CMS:

```ts
const delta = await fetchCmsDelta(); // { billing: { invoice_summary: { it: "…" } } }
for (const [key, locales] of Object.entries(delta.billing ?? {})) {
  const result = validateExternalKey("billing", key, locales);
  if (result.ok) engine.mergeNamespace("billing", result.data);
}
const t = engine.toView({ namespaces: ["billing"], locale: "it" });
```

---

## 14. Conclusione

La modifica è **coerente con il posizionamento “compiler-first”** della libreria: oggi il compilatore promette più di quanto il runtime possa garantire appena si esce dal caso canonical eager.

Stesso ragionamento per la validazione esterna (§13): oggi il contratto è **spec-driven** (tutte le chiavi obbligatorie); per merge parziali serve un percorso **input-driven** (valida solo ciò che arriva).

Il costo principale non è il formatting ICU (invariato), ma:

- una **riformulazione del contratto TypeScript** (engine vs view);
- **codegen condizionale** per delivery mode;
- **breaking change** deliberata sulla superficie pubblica.

Il beneficio è un modello mentale chiaro:

> _Non chiami `get` su un dizionario che non hai ancora caricato, e non interroghi `hasNamespace` per scoprire cosa c'è. Costruisci una view con `with…`, attendi il load, poi traduci — se compila, la risorsa c'è._

Prossimo passo consigliato: rispondere alle domande della §12, poi prototipare i tipi della Fase 1 su un branch senza toccare il codegen, per validare che i generics restino leggibili con uno schema reale (es. demo `areas`).
