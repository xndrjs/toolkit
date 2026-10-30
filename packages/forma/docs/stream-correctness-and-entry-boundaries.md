# Correttezza degli stream ed Entry Boundary

> Stato: decisioni implementate; rationale, finding e piano conservati come design record.
>
> Data: 2026-10-30.
>
> Scope: implementazione corrente degli stream, semantica delle root della Surface,
> direzionalità degli Adapter e introduzione degli Entry Boundary.

## Esito dell'implementazione

Le decisioni del grill sono state applicate al core, ai type-level assert, al demo e alla
documentazione:

- `compose` richiede `entryBoundaries` e valida la corrispondenza esatta con le origini Boundary
  della Surface;
- la provenance precisa attraversa `Provider`, builder Boundary e builder Adapter;
- Adapter root, Entry Boundary duplicati/non rappresentati e Surface vuote vengono rifiutati a
  compile time quando i tipi sono precisi e sempre a runtime;
- `describePlan()` include Entry Boundary e provenance delle root;
- il demo espone `WatchOrdersProvider` di Orders e risolve privatamente `WatchOrderEvents` tramite
  Adapter;
- signal già abortito, accettazione post-abort e cleanup degli stream seguono la semantica
  concordata;
- i close guidati dall'owner non producono rejection floating, il context osserva i failure e
  tenta comunque tutti i Provider disposer;
- l'alias deprecato `createExecutionContext` è stato rimosso.

Le decisioni normative sono registrate negli ADR 0008, 0012 e 0013.

## Stato del grill

### Decisioni condivise — round 1

1. Un Provider originato da Adapter non può mai essere una root della Surface; `compose` non offre
   escape hatch per aggirare questa regola.
2. Una Composition è un'unità di ownership runtime/lifecycle, non una proiezione uno-a-uno di un
   Boundary. Dichiara uno o più Entry Boundary e può attraversare privatamente altri Boundary.
3. Se il parent signal è già abortito al primo `next()`, lo stream termina normalmente senza
   materializzare il Provider e senza avviare la sorgente.
4. Ogni failure di close deve essere osservato dall'attore che possiede o avvia la chiusura; tutti
   i cleanup successivi vengono comunque tentati e gli eventuali failure multipli aggregati.

### Decisioni condivise — round 2

1. `compose` mantiene un singolo options bag con `entryBoundaries` obbligatorio e non vuoto; non
   viene introdotto nuovo currying né un fluent builder.
2. Il tipo `Provider` conserva la provenance precisa attraverso un generic finale `Origin`; i
   builder Boundary e Adapter mantengono `kind` e ID literal.
3. L'abort non maschera i failure tecnici di una sorgente già attiva: una sorgente che completa in
   risposta al signal termina normalmente, una sorgente che rigetta continua a produrre un errore
   tecnico.
4. Il close rimane rappresentato da una sola promise idempotente. Più caller concorrenti possono
   osservare la stessa rejection; non esiste uno stato “errore consumato”.

### Decisioni condivise — round 3

1. La migrazione è intenzionalmente breaking: `entryBoundaries` diventa obbligatorio senza
   overload legacy, fallback, inferenza automatica o API deprecate.
2. Entry Boundary distinti con lo stesso ID canonico sono duplicati e vengono rifiutati a runtime,
   con controllo type-level best-effort per tuple literal.
3. `describePlan()` viene esteso con Entry Boundary e provenance delle root della Surface, ma non
   ancora con l'intero grafo delle dipendenze.
4. Non viene introdotto `defineEntryBoundaries()`; la dichiarazione inline è la forma supportata
   per la nuova lista.
5. Il demo separa `WatchOrders` entry Intent da `WatchOrderEvents` dynamic seam mantenendo, per
   ora, lo stesso Contract.
6. La decisione sugli Entry Boundary avrà un nuovo ADR; ADR 0001 verrà superseded limitatamente
   alle Adapter root e ADR 0012 chiarirà pre-abort ed error ownership.

### Decisioni condivise — round 4

1. `defineWiring` e `defineComposition` rimangono disponibili per wiring e config estratti, ma non
   viene introdotto un helper dedicato agli Entry Boundary e gli esempi principali usano la forma
   inline.
2. Il set dichiarato degli Entry Boundary deve coincidere con il set delle origini Boundary
   effettivamente presenti nella Surface: nessun Boundary implicito e nessun Entry Boundary
   dichiarato ma inutilizzato.
3. L'host abort non dispone automaticamente il context, ma gli impedisce di accettare nuovo
   lavoro: uno stream non parte e una nuova invocation unary viene rifiutata prima della
   materializzazione. Il lavoro già accettato rimane cooperativo tramite signal.

### Decisioni condivise — round 5

1. Una Composition con `surface: {}` è invalida: gli Entry Boundary sono non vuoti e devono
   coincidere esattamente con le origini Boundary rappresentate nella Surface.
2. `openExecutionContext({ signal })` fallisce immediatamente se il signal dell'host è già
   abortito. Se l'abort avviene dopo l'apertura, il context non accetta nuovo lavoro ma rimane di
   proprietà dell'host e deve comunque essere disposto.
3. Una nuova invocation unary dopo l'host abort rigetta con `signal.reason`, secondo la semantica
   standard di `AbortSignal.throwIfAborted()`. La cancellazione è un failure tecnico e non entra
   nel `Result` applicativo.

Il fronte decisionale del grill è chiuso. L'implementazione può iniziare dopo la conferma
esplicita dello shared understanding riassunto in questo documento.

## Executive summary

Il modello streaming di Forma è strutturalmente valido: la modality appartiene al Contract, il
lifetime della stream invocation è separato dal lifetime del Provider, la Surface espone un
`AsyncIterable` cold e tutti i normali percorsi di chiusura convergono sulla stessa state machine.

La review ha però individuato due bug concreti e un rischio conseguente nella composizione dei
cleanup:

1. un parent signal già abortito può chiudere lo stream prima che esista `startPromise`; la
   sorgente viene comunque avviata subito dopo, ma non riceve mai `return()`;
2. un errore di cleanup prodotto da una chiusura guidata dall'abort non viene osservato
   dall'owner: `ExecutionContext.dispose()` può risolversi mentre Node riceve una
   `unhandledRejection`;
3. una correzione ingenua del secondo problema farebbe emergere un altro difetto: oggi un errore
   di `streams.closeAll()` impedirebbe l'esecuzione dei disposer dei Provider posseduti dal
   context.

La review architetturale ha inoltre evidenziato un problema di direzionalità. Attualmente
`compose({ surface })` accetta come root un Provider creato da un Adapter. L'Intent realizzato
appartiene al target Boundary dell'Adapter, ma l'esecuzione parte da un Provider la cui origine è
l'Adapter. Questo sovrappone nello stesso Intent due ruoli differenti: contratto pubblico di
ingresso e dynamic seam non realizzato.

La decisione condivisa è rendere obbligatorio per ogni Composition un insieme non vuoto di
**Entry Boundary** e richiedere che ogni root della Surface sia un Provider originato da uno di
questi Boundary. I Provider originati da Adapter rimangono validi nel wiring privato, ma non
possono essere root della Surface.

L'interfaccia raccomandata non richiede currying:

```ts
const root = compose({
  entryBoundaries: [Orders, OtherBoundary],
  surface: {
    getOrder: GetOrderProvider,
    // ...
  },
  wiring: [
    FindOrderViaPostgresProvider,
    // ...
  ],
});
```

Un prototipo TypeScript ha verificato che il singolo options bag conserva gli ID literal degli
Entry Boundary e i tipi esatti dei Provider in Surface, rifiutando sia una root originata da un
Adapter sia una root appartenente a un Boundary non autorizzato.

Il currying rimane giustificato soltanto nella forma già esistente con Params espliciti, perché in
quel caso un generic viene fornito dal chiamante mentre i generic successivi devono essere
inferiti:

```ts
compose<HostParams>()({
  entryBoundaries: [Orders],
  surface: { getOrder: GetOrderProvider },
  wiring: [FindOrderViaPostgresProvider],
});
```

## Baseline della review

Al momento della review:

- tutti i 23 file di test passavano;
- tutti i 189 test passavano;
- il typecheck TypeScript passava;
- ESLint non riportava errori e segnalava un solo warning per l'argomento inutilizzato
  `streamController` in `wireParentAbort`;
- i due bug di lifecycle descritti sotto sono stati riprodotti con probe runtime isolati, non
  presenti nella suite ordinaria.

La suite verde non contraddice quindi i finding: le interazioni rilevanti non sono attualmente
coperte.

## Cosa funziona bene nel design degli stream

I finding sono problemi locali di correttezza, non una bocciatura del modello.

### La modality è esplicita

`unary | stream` è una proprietà del Contract. Uno stream non è modellato come un risultato unary
il cui valore di successo contiene accidentalmente un `AsyncIterable`.

Questo mantiene la modality visibile e verificabile in:

- Adapter;
- Intent alias;
- dipendenze `using`;
- typing della Surface;
- `describePlan()`.

### Stream invocation e Provider lifetime sono separati

Un'istanza di Provider può essere posseduta dalla Composition o dall'execution context,
indipendentemente dal lifetime di ogni stream invocation:

```text
Provider lifetime
  materialization → cache → Lifetime.onDispose

Stream invocation lifetime
  first next() → iteration → abort/return/completion → close
```

Unificare i due concetti costringerebbe a ricreare il Provider per ogni stream oppure a mantenere
aperte le risorse della singola invocation per tutto il lifetime del Provider.

### Il protocollo pubblico è piccolo

La Surface restituisce sincronicamente un
`AsyncIterable<Result<Item, Err>> & AsyncDisposable` cold e single-consumer:

- il pull fornisce backpressure naturale;
- gli errori attesi sono in-band e terminali;
- gli errori tecnici inattesi usano `throw`;
- il return value del generator non entra nel protocollo pubblico;
- creare l'iterable non materializza il Provider e non acquisisce risorse;
- `break`, `return()`, async dispose, abort, completamento naturale ed `Err` terminale convergono
  sulla stessa chiusura.

### La proprietà della cancellazione è esplicita

Ogni invocation riceve un signal dedicato, subordinato a quello dell'execution context e distinto
da `Lifetime.signal`. Uno stream può quindi essere cancellato senza cancellare i sibling o
disporre il Provider che lo ha prodotto.

### L'abort chiude l'accettazione, non trasferisce l'ownership

Il signal opzionale dell'host controlla l'accettazione di nuovo lavoro senza diventare owner
dell'execution context:

- un signal già abortito fa fallire immediatamente `openExecutionContext()`;
- dopo l'apertura, l'abort impedisce di accettare nuove invocation;
- una nuova invocation unary rigetta con `signal.reason`, usando
  `AbortSignal.throwIfAborted()`; la cancellazione rimane fuori dal `Result` applicativo;
- uno stream cold creato prima dell'abort ma non ancora avviato termina normalmente al primo
  `next()`, senza materializzare Provider né sorgente;
- il lavoro già accettato riceve il signal e rimane responsabile della cancellazione
  cooperativa;
- l'abort dell'host non chiama `dispose()`: il context aperto rimane di proprietà dell'host.

Questa distinzione evita di confondere la cancellazione del lavoro con la liberazione delle
risorse. `withExecutionContext()` garantisce comunque il dispose nel proprio `finally`, mentre
chi usa `openExecutionContext()` deve disporre esplicitamente il handle anche dopo l'abort.

## Finding di correttezza

### F1 — Un parent già abortito può perdere il cleanup della sorgente

**Priorità: alta.**

In `managed-async-iterator.ts`, `beginStart()` esegue oggi queste operazioni nell'ordine seguente:

```ts
phase = "starting";
startAttempted = true;
controller = new AbortController();
wireParentAbort(controller);

startPromise = Promise.resolve().then(() => start(controller.signal));
```

Se il parent è già abortito, `wireParentAbort()` chiama immediatamente `beginClose("abort")`. In
quel momento `startPromise` è ancora `undefined`, quindi `runClose()` non ha nulla da attendere e
porta il managed iterable a `closed`.

Il controllo ritorna poi a `beginStart()`, che crea ed esegue comunque `startPromise`. L'iterator
prodotto viene assegnato dopo che il close è terminato e non riceve mai `return()`.

Il probe isolato ha prodotto:

```text
next()       → { done: true, value: undefined }
final phase  → closed
return calls → 0
```

Lo scenario è realistico: un host signal può abortire l'execution context senza disporlo; una
successiva chiamata può quindi provare ad avviare uno stream attraverso un context ancora aperto
ma con signal già abortito.

#### Semantica richiesta

Uno stream avviato sotto un parent già abortito non deve materializzare il Provider né avviare la
sorgente. Il managed iterable deve chiudersi senza acquisire un execution lease.

Va inoltre eliminata la race fra controllo del signal, registrazione del listener e assegnazione
di `startPromise`. Una volta accettato lo start, il close deve attenderne l'esito e chiamare
`return()` esattamente una volta se viene prodotto un iterator.

#### Test di accettazione

- parent già abortito prima del primo `next()` → `start` non viene chiamato;
- abort dopo l'accettazione dello start ma prima della sua risoluzione → l'iterator risultante
  riceve `return()` una volta;
- dispose e abort in race con start condividono una sola close promise;
- dopo il close non rimangono lease, registrazioni o materializzazioni residue.

### F2 — Gli errori di cleanup guidati dall'abort diventano unhandled rejection

**Priorità: alta.**

Il listener del parent signal avvia oggi il close senza osservare la promise:

```ts
const onAbort = (): void => {
  void beginClose("abort");
};
```

`runClose()` raccoglie correttamente i failure di `inner.return()` e `onClosed()`, quindi rigetta la
close promise. Il problema è chi possiede e osserva quella rejection.

Durante il dispose del context, la sequenza corrente è:

```text
ExecutionContext.dispose()
  → abort del context signal
  → il listener avvia il close dello stream
  → onClosed rimuove lo stream dal registry e rilascia il lease
  → la close promise rigetta
  → il drain dell'execution termina
  → registry.closeAll() non vede più lo stream
  → ExecutionContext.dispose() si risolve
  → Node osserva unhandledRejection
```

Un probe isolato ha confermato contemporaneamente che:

- il disposer del Provider è stato eseguito;
- `ExecutionContext.dispose()` si è risolto con successo;
- Node ha emesso `unhandledRejection: stream cleanup failed`.

Questo viola il modello di ownership: un close iniziato dall'owner deve essere atteso dall'owner e
il suo eventuale failure deve entrare nella error matrix del dispose.

#### Semantica richiesta

- nessuna close promise creata dall'abort deve rimanere floating;
- il registry deve conservare abbastanza informazione sul settlement da permettere all'owner di
  attendere ogni close che ha iniziato, inclusi gli stream in `starting` o `closing`;
- un host abort senza dispose immediato non deve produrre unhandled rejection;
- stream dispose, pending `next()` e context dispose possono osservare la stessa close promise e
  la stessa eventuale rejection;
- un failure non deve impedire il rilascio release-once del lease e il bookkeeping del registry.

Il meccanismo può essere una settlement record posseduta dal registry, una promise `closed`
interna o un canale esplicito per i failure dei close guidati dall'owner. L'invariante è più
importante della rappresentazione: ogni close guidato dall'owner deve avere un esito terminale
osservato dall'owner.

Gli observer della stessa close promise sono:

- close iniziato da `iterator.return()` o async dispose dello stream → lo osserva il consumer;
- close iniziato da context/root dispose → lo osserva il dispose dell'owner;
- close iniziato dal solo host abort → una successiva operazione dello stream e il context dispose
  possono osservare lo stesso esito; il listener interno deve comunque impedire una
  `unhandledRejection`.

#### Test di accettazione

- `inner.return()` fallisce durante `ctx.dispose()` → `ctx.dispose()` rigetta con quel failure;
- lo stesso scenario non emette `unhandledRejection`;
- l'host abort chiude lo stream senza disporre il context e senza unhandled rejection;
- il successivo context dispose può osservare la stessa rejection senza duplicare il cleanup;
- `iterator.return()`, async dispose, host abort e context dispose concorrenti non duplicano
  cleanup o rilascio del lease.

### F3 — Propagare il failure dello stream non deve saltare i Provider disposer

**Priorità: alta come parte della correzione di F2.**

Il context esegue attualmente:

```ts
await streams.closeAll();
await contextScope.dispose(...);
```

Oggi F2 nasconde spesso i failure degli stream e la seconda operazione viene comunque eseguita.
Quando `closeAll()` inizierà a propagarli correttamente, questa sequenza salterà tutti i disposer
dei Provider posseduti dal context e la rimozione da `openContexts`.

Inoltre `closeAll()` usa `Promise.all`: tutte le promise vengono avviate, ma il risultato espone
soltanto la prima rejection invece di comporre tutti i failure secondo le regole di disposal già
adottate da Forma.

#### Semantica richiesta

Il context dispose deve tentare sempre, anche in presenza di failure precedenti:

1. il close di ogni stream invocation posseduta;
2. tutti i Provider disposer context-owned in ordine LIFO;
3. la rimozione del context dal registry `openContexts`;
4. l'aggregazione di più failure tramite la policy `AggregateError` esistente.

L'interfaccia già disponibile `ProviderScope.dispose({ beforeDisposers, after })` esprime bene
questa composizione:

- la chiusura degli stream può avvenire in `beforeDisposers`;
- i disposer dei Provider vengono comunque tentati;
- `after` rimuove sempre il context;
- gli errori vengono raccolti secondo la error matrix comune.

Prima di usare questa struttura, il registry deve essere corretto affinché `closeAll()` osservi
davvero tutti i close guidati dall'owner.

#### Test di accettazione

- il cleanup dello stream fallisce, ma tutti i Provider disposer vengono eseguiti;
- cleanup dello stream e un Provider disposer falliscono → entrambi compaiono in
  `AggregateError`;
- più stream falliscono durante il cleanup → tutti i failure sono riportati dopo il settlement di
  tutti gli stream;
- il context viene rimosso da `openContexts` dopo cleanup riuscito o fallito;
- il root dispose non prova a disporre nuovamente un context fallito ma apparentemente ancora
  aperto.

### F4 — Igiene minore dell'implementazione

`wireParentAbort(streamController)` non usa `streamController` e produce l'unico warning ESLint
corrente. Non è un problema di correttezza, ma segnala anche l'ambiguità descritta in F1: la
funzione riceve un controller, ma avvia direttamente il managed close.

L'implementazione finale dovrebbe usare quell'argomento nel protocollo scelto oppure rimuoverlo.

## Finding di direzionalità: Adapter come root della Surface

### Grafo corrente

Il demo consente oggi questa forma:

```text
surface.watchOrders
        │
        ▼
WatchOrdersViaPostgresProvider
origin: Adapter "orders-postgres"
intent: Orders.WatchOrders
```

L'identità dell'Intent appartiene a `Orders` e l'Adapter è correttamente associato a quel target
Boundary. Tuttavia, le entry della Surface sono Provider, non Intent isolati. L'esecuzione parte
quindi da un Provider originato dall'Adapter, non da un Provider posseduto da `Orders`.

La distinzione è rilevante perché Forma attribuisce già poteri differenti alle due origini:

- `Intent.provide.using(...)` può dipendere soltanto da Intent dello stesso Boundary;
- `adapter(...).adapt(...).using(...)` può dipendere da Intent di qualsiasi Boundary.

Permettere al secondo di essere una root significa iniziare il grafo proprio dal nodo con la
maggiore libertà cross-Boundary. La restrizione same-boundary rimane localmente vera, ma non
governa più il punto di partenza.

### I ruoli sovrapposti

Nella forma diretta, `Orders.WatchOrders` svolge contemporaneamente tre ruoli:

1. contratto pubblico esposto dalla Composition;
2. Intent non realizzato usato come dynamic seam;
3. Intent realizzato direttamente da un Adapter esterno.

La replaceability runtime rimane possibile, ma scompare la transizione di ownership attraverso
`Orders`. Nessun Provider di Orders sceglie, limita, trasforma o delega esplicitamente verso quel
seam. L'Adapter possiede di fatto il percorso pubblico pur non possedendo il Contract dell'Intent.

Questo è lo short-circuit architetturale:

```text
Corrente
Surface → Adapter realization di un Orders Intent

Desiderato
Surface → Orders realization → unresolved Orders Intent → Adapter realization
```

### Grafo desiderato

L'esempio streaming dovrebbe distinguere l'entry Intent dal dynamic seam:

```text
surface.watchOrders
        │
        ▼
Orders.WatchOrders
Provider origin: Boundary "orders"
        │
        ▼
Orders.WatchOrderEvents
unrealized internal Intent
        │
        ▼
Postgres o Memory Adapter
```

Per esempio:

```ts
export const WatchOrders = Orders.stream("watchOrders").contract<OrderId, OrderEvent, WatchError>();

export const WatchOrderEvents = Orders.stream("watchOrderEvents").contract<
  OrderId,
  OrderEvent,
  WatchError
>();

export const WatchOrdersProvider = WatchOrders.provide
  .using({ events: WatchOrderEvents })
  .with(({ deps: { events } }) => {
    return (orderId, invocation) => events(orderId, invocation);
  });
```

La prima realizzazione può essere un passthrough. Il suo valore non consiste nella complessità
implementativa nascosta, ma nella separazione di due ruoli architetturali e nella preservazione
della direzione del grafo. Autorizzazione, projection, filtering, error mapping, deduplication o
composizione di stream trovano poi una collocazione posseduta da Orders senza modificare il
contratto pubblico o il seam degli Adapter.

## Modello condiviso: Entry Boundary

### Definizione

Un **Entry Boundary** è un Boundary esplicitamente autorizzato a possedere root della Surface per
una determinata Composition.

Questo non implica una Composition per Boundary. La Composition continua a rappresentare un
grafo chiuso con ownership runtime e lifecycle propri e può attraversare molti Boundary. Gli Entry
Boundary identificano soltanto i punti dai quali può iniziare l'attraversamento pubblico.

### Invariante fondamentale

Per ogni alias `s` della Surface:

```text
provider(s).origin.kind = "boundary"
provider(s).origin.id ∈ composition.entryBoundaryIds
```

Deve inoltre valere l'inverso: ogni ID dichiarato in `entryBoundaryIds` compare come origine di
almeno una root della Surface. Il set dichiarato descrive le entry effettive, non una allowlist
potenziale.

Ne consegue che una Composition non può avere una Surface vuota: `entryBoundaries` è non vuoto e
ogni Entry Boundary dichiarato deve possedere almeno una root. Una Composition priva di API
pubblica non rappresenta il modello di Composition supportato da Forma.

Conseguenze:

- un Provider originato da un Entry Boundary autorizzato è una root valida;
- un Provider originato da un altro Boundary viene rifiutato;
- un Provider originato da Adapter viene rifiutato anche quando il suo target Intent appartiene a
  un Entry Boundary;
- un Entry Boundary senza alcun alias della Surface viene rifiutato;
- i Provider originati da Adapter rimangono validi nel `wiring` privato;
- ogni percorso cross-Boundary raggiungibile dalla Surface inizia sotto ownership esplicita di un
  Boundary.

### Perché il target Boundary non basta

Controllare soltanto `provider.intent.boundaryId` accetterebbe l'esempio corrente:
`WatchOrdersViaPostgresProvider.intent.boundaryId` è già `orders`.

La validazione deve controllare anche l'origine del Provider. Consentire un insieme di Boundary
degli Intent risponde soltanto a “chi ha dichiarato il Contract?”, non a “da dove parte
l'esecuzione?”.

La validazione degli Entry Boundary risponde a entrambe le domande:

- il Contract appartiene a un Boundary autorizzato;
- la root realization è posseduta da quel Boundary, non da un Adapter.

### Non serve una Composition per ogni Boundary

Creare una Composition distinta per ogni Boundary legherebbe la partizione architetturale
all'ownership runtime e introdurrebbe problemi non necessari:

- execution context annidati;
- Provider composition-scoped duplicati;
- propagazione di signal e Params fra root;
- ordinamento del dispose fra Composition;
- Surface intermedie pubbliche usate soltanto per collegare grafi interni.

La regola raccomandata è:

> Una Composition per unità di ownership runtime/lifecycle; un insieme esplicito e non vuoto di
> Entry Boundary per Composition.

Una Composition di sottosistema può avere un solo Entry Boundary:

```ts
entryBoundaries: [Orders];
```

Una Composition applicativa può aggregarne intenzionalmente diversi:

```ts
entryBoundaries: [Orders, Billing, Identity];
```

Entrambe possono attraversare privatamente altri Boundary tramite Provider e Adapter registrati.

## Design dell'interfaccia e inferenza TypeScript

### Domanda verificata

La forma curried proposta era:

```ts
compose([Orders, OtherBoundary])({
  surface: {
    /* ... */
  },
  providers: [
    /* ... */
  ],
});
```

Il dubbio era che TypeScript potesse inferire la lista degli Entry Boundary in modo troppo ampio
prima di validare la Surface, perdendo gli ID literal richiesti dall'invariante.

### Metodo di verifica

È stato compilato in modalità strict un prototipo TypeScript che modellava:

- valori `Boundary<Id>` con ID literal;
- Provider originati da Boundary e da Adapter;
- l'unione degli ID autorizzati derivata dalla tuple degli Entry Boundary;
- una diagnostica phantom-property `AssertSurfaceRoots<Entries, Surface>`;
- il tipo esatto della Surface risultante.

Sono state verificate queste tre forme:

```ts
composeSingle({
  entryBoundaries: [Orders, Billing],
  surface: { getOrder: GetOrderProvider, getInvoice: GetInvoiceProvider },
});

composeTwoArgs([Orders, Billing], {
  surface: { getOrder: GetOrderProvider, getInvoice: GetInvoiceProvider },
});

composeCurried([Orders, Billing])({
  surface: { getOrder: GetOrderProvider, getInvoice: GetInvoiceProvider },
});
```

Tutte e tre preservano i tipi esatti dei Provider in Surface. Tutte e tre rifiutano:

- un Provider originato da Adapter usato come root;
- un Provider di Billing quando soltanto `Orders` è dichiarato come Entry Boundary.

La forma con singolo bag funziona perché gli Entry Boundary sono valori ordinari. Con un `const`
generic, TypeScript inferisce nello stesso call gli ID literal e la Surface esatta, quindi valuta
l'assert intersecato. Non avviene alcuna applicazione parziale dei generic.

### Perché il currying dei Params è diverso

La forma corrente rimane giustificata:

```ts
compose<ExplicitParams>()({
  /* Surface e wiring inferiti */
});
```

TypeScript non permette di fornire soltanto il primo generic e inferire liberamente quelli
successivi nella stessa chiamata. Il primo call cattura il Params type esplicito; la funzione
generic restituita inferisce Surface e wiring dal valore.

Gli Entry Boundary non hanno questo limite perché vengono inferiti da valori runtime, non
specificati come type argument espliciti.

### Confronto delle alternative

| Forma                                           | Precisione type | Costo dell'interfaccia                         | Valutazione                 |
| ----------------------------------------------- | --------------- | ---------------------------------------------- | --------------------------- |
| `compose({ entryBoundaries, surface, wiring })` | Preservata      | Un solo options bag già esistente              | Raccomandata                |
| `compose([boundaries], { surface, wiring })`    | Preservata      | Nuova convenzione posizionale e nuovi overload | Corretta, ma meno esplicita |
| `compose([boundaries])({ surface, wiring })`    | Preservata      | Un call aggiuntivo e un altro tipo di currying | Non necessario              |
| `compose.boundaries(...).as({ ... })`           | Preservata      | Nuovo builder e nuovo oggetto intermedio       | Non necessario              |

La forma fluent avrebbe valore soltanto se il primo stage dovesse essere riutilizzato fra più
Composition o se TypeScript richiedesse una inference barrier. Nessuno dei due bisogni è emerso.

### Forma pubblica raccomandata

```ts
const root = compose({
  entryBoundaries: [Orders, Billing],
  surface: {
    getOrder: GetOrderProvider,
    getInvoice: GetInvoiceProvider,
  },
  wiring: [FindOrderViaPostgresProvider, LoadInvoiceViaPostgresProvider],
});
```

Va mantenuto il nome `wiring`, non `providers`. L'array corrente può contenere sia Provider sia
entry prodotte da `aliasIntent()`; chiamarlo `providers` sarebbe inesatto e legherebbe questa
decisione a un breaking change indipendente.

La lista degli Entry Boundary deve essere obbligatoria e non vuota. Renderla opzionale e inferirla
dalla Surface permetterebbe di rifiutare le root Adapter, ma non rileverebbe l'esposizione
accidentale di un Boundary aggiuntivo: proprio uno dei problemi che la proposta vuole risolvere.

### Sketch della type signature

La forma può rimanere un singolo generic call:

```ts
type EntryBoundaries = readonly [Boundary<string>, ...Boundary<string>[]];

export function compose<
  const Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(
  options: ComposeOptions<Entries, Surface, Wiring> &
    ComposeAsserts<Surface, Wiring> &
    AssertSurfaceRoots<Entries, Surface>
): CompositionRoot<Surface, InferredParamsFor<Surface, Wiring>>;
```

La diagnostica dovrebbe riportare gli alias invalidi distinguendo le due cause:

```text
Surface alias "watchOrders" uses Adapter-originated Provider "orders-postgres".
Adapter Providers cannot be Composition roots.
```

```text
Surface alias "getInvoice" starts from Boundary "billing".
Declared Entry Boundaries: orders.
```

La stessa validazione deve esistere a runtime per caller JavaScript, config widened e cast.

## Modifiche richieste al type model

### Conservare l'origine nel tipo concreto del Provider

Il tipo `Provider` corrente contiene:

```ts
readonly origin: ProviderOrigin;
```

Ogni Provider concreto espone quindi l'intera union:

```ts
{ kind: "boundary"; id: string } | { kind: "adapter"; id: string }
```

Il builder conosce l'origine precisa, ma il return type pubblico la cancella. La validazione degli
Entry Boundary non può distinguere staticamente una root Boundary da una root Adapter finché
questa informazione non viene preservata.

La modifica meno invasiva è aggiungere `Origin` in coda ai generic di `Provider`:

```ts
export type Provider<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps = Record<string, never>,
  Policy extends LifetimePolicy = "auto",
  Params = void,
  Mode extends IntentModality = "unary",
  Origin extends ProviderOrigin = ProviderOrigin,
> = {
  // ...
  readonly origin: Origin;
};
```

I builder di Boundary devono restituire:

```ts
Provider<
  /* generic esistenti */,
  { readonly kind: "boundary"; readonly id: BoundaryId }
>
```

I builder di Adapter devono conservare un'origine Adapter altrettanto precisa. Rendere l'Adapter
ID un `const` generic migliorerebbe diagnostica e `describePlan()`, anche se per rifiutare una root
è sufficiente preservare `kind: "adapter"`.

Tutti i conditional type che destrutturano `Provider` devono essere aggiornati per il nuovo
generic finale. `AnyProvider` può cancellarlo internamente, ma `Surface` deve catturare i Provider
concreti prima che l'assert ne estragga l'origine.

### Aggiungere gli Entry Boundary ai dati di composizione

`ComposeOptions` deve contenere la lista precisa degli Entry Boundary. Il compiler deve derivare
una sola volta il set degli ID e usarlo per la validazione runtime della Surface.

Gli ID duplicati dovrebbero produrre una diagnostica chiara invece di essere normalizzati
silenziosamente. L'identità degli Intent tratta già Boundary con lo stesso ID come la stessa
identità architetturale; ripeterli non aggiunge informazione e segnala normalmente un errore nella
dichiarazione.

### Rendere la direzione visibile in `describePlan()`

Il plan dovrebbe esporre almeno:

```ts
{
  entryBoundaries: ["orders"],
  surface: [
    {
      alias: "watchOrders",
      intent: ["orders", "watchOrders"],
      origin: { kind: "boundary", id: "orders" },
    },
  ],
  providers: [/* descrizioni dei lifetime esistenti */],
}
```

Questo rende l'invariante ispezionabile nei test e permette al tooling di spiegare da dove parte
il grafo, non soltanto quali Provider contiene.

## Aggiornamenti richiesti a decisioni e documentazione

La proposta modifica il domain model corrente e supersede parzialmente ADR 0001, che dichiara
esplicitamente un Provider di Adapter registrabile in `compose({ surface, wiring })`.

L'implementazione richiede quindi un nuovo ADR che registri queste decisioni:

- Adapter rimane un'origine architetturale first-class peer di Boundary;
- i Provider originati da Adapter sono realizzazioni private valide, ma non root della Surface;
- ogni Composition dichiara i propri Entry Boundary;
- le root della Surface devono essere possedute dagli Entry Boundary dichiarati;
- lo scope di ownership della Composition non coincide necessariamente uno-a-uno con un Boundary.

Il Glossary deve introdurre **Entry Boundary** e precisare le definizioni esistenti:

- **Boundary** possiede i Contract degli Intent e può essere autorizzato come entry della
  Composition;
- **Entry Boundary** è esplicitamente autorizzato a possedere root della Surface;
- **Surface** contiene soltanto alias di Provider posseduti dagli Entry Boundary dichiarati;
- **Adapter** realizza dynamic seam dietro un percorso posseduto da un Boundary e non può essere
  una root della Surface;
- **Composition** possiede un grafo chiuso, il relativo lifecycle e un insieme esplicito non vuoto
  di Entry Boundary.

README e demo devono usare coerentemente la nuova forma di `ComposeOptions`.

## Migrazione di `forma-demo`

Il percorso unary mostra già la direzione desiderata:

```text
Surface
  → Orders.GetOrder Provider
  → Orders.FindOrder unresolved Intent
  → Memory/Postgres Adapter
```

Il percorso streaming deve essere portato allo stesso modello:

```text
Surface
  → Orders.WatchOrders Provider
  → Orders.WatchOrderEvents unresolved Intent
  → Memory/Postgres Adapter
```

Entrambe le composizioni dichiarano:

```ts
entryBoundaries: [Orders];
```

`WatchOrderEventsViaMemoryProvider` e `WatchOrderEventsViaPostgresProvider` realizzano
`WatchOrderEvents` nel `wiring`. La Surface espone lo stesso
`WatchOrdersProvider` originato da Orders in entrambe le varianti.

## Piano di implementazione

Le correzioni di lifecycle e gli Entry Boundary sono indipendenti e dovrebbero arrivare in change
separati.

### Fase 1 — Correttezza del lifecycle streaming

1. Rifiutare l'apertura di un execution context quando il signal dell'host è già abortito.
2. Impedire nuove invocation unary dopo l'abort, propagando `signal.reason`.
3. Applicare allo stream con parent già abortito la semantica di nessuno start e nessuna
   materializzazione.
4. Riordinare start e registrazione dell'abort affinché ogni start accettato sia atteso dal close.
5. Dare al registry un esito terminale osservabile per i close guidati dall'owner.
6. Fare in modo che `closeAll()` attenda tutti gli stream e aggreghi tutti i failure.
7. Comporre il close degli stream con il Provider-scope dispose del context, garantendo Provider
   disposer e rimozione finale del context.
8. Aggiungere i test di race ed error matrix elencati in F1–F3.
9. Eliminare il warning ESLint nel protocollo definitivo di abort.

### Fase 2 — Provenance precisa dei Provider

1. Aggiungere il generic finale `Origin` a `Provider`.
2. Propagare origini Boundary e Adapter precise attraverso entrambe le famiglie di builder.
3. Conservare l'origine attraverso `AnyProvider`, inferenza della Surface, helper del wiring e
   conditional type.
4. Aggiungere type test isolati per builder chain, lifetime modifier e `.using(...)`.

### Fase 3 — Validazione degli Entry Boundary

1. Aggiungere `entryBoundaries` obbligatorio e non vuoto a `ComposeOptions`.
2. Aggiungere `AssertSurfaceRoots<Entries, Surface>` con diagnostica per alias.
3. Aggiungere la validazione runtime equivalente prima della compilazione del grafo.
4. Rifiutare Entry Boundary ID duplicati e Boundary dichiarati ma non rappresentati nella
   Surface.
5. Estendere `defineComposition` senza introdurre nuovo currying o fluent builder.
6. Mantenere funzionante `compose<ExplicitParams>()({...})` con il nuovo bag.
7. Estendere `describePlan()` con Entry Boundary e provenance delle root.

### Fase 4 — Migrazione e documentazione

1. Migrare test ed esempi README agli Entry Boundary espliciti.
2. Separare nel demo lo stream entry Intent dallo stream dynamic-seam Intent.
3. Aggiungere il nuovo ADR e marcare come superseded la clausola sulla Surface di ADR 0001.
4. Aggiornare il Glossary.
5. Aggiungere una migration note: cambia ogni chiamata a `compose` e le Surface root Adapter
   diventano invalide.

## Decisioni raccomandate

1. Correggere le due race confermate prima di considerare completo il supporto streaming.
2. Comporre i failure di cleanup senza saltare mai gli owner successivi.
3. Considerare una root Adapter nella Surface uno short-circuit architetturale e rifiutarla.
4. Richiedere a ogni Composition uno o più Entry Boundary espliciti.
5. Richiedere corrispondenza esatta fra Entry Boundary dichiarati e Boundary effettivamente
   esposti, consentendo comunque alla Composition di attraversare privatamente altri Boundary.
6. Mantenere l'interfaccia a singolo options bag aggiungendo `entryBoundaries`.
7. Non introdurre currying o fluent builder per l'inferenza degli Entry Boundary.
8. Mantenere il nome `wiring`, perché la lista non contiene soltanto Provider.
9. Conservare la provenance nel type model affinché compile time e runtime applichino la stessa
   regola.
10. Registrare la decisione architetturale in un ADR e aggiornare il Glossary durante
    l'implementazione.
