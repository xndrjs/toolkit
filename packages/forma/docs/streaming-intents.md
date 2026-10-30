# Streaming Intent e operation multi-yield

> Stato: modello target concordato (grill); spike Fase 0 completato
> (`src/spike/managed-async-iterator.ts` + test); decisioni rese vincolanti da
> [ADR 0012](./adr/0012-streaming-intents.md).
> Le decisioni sotto “Decisioni chiuse” non si riaprono senza un nuovo trade-off.
>
> Scope: supporto a stream pull-based tramite `AsyncIterable` / async generator. Questo documento
> non propone dependency resolution dinamica tramite `yield`.

## Executive summary

Gli async generator si integrano bene con Forma quando i `yield` appartengono all'operation e
rappresentano gli elementi di uno stream:

```ts
const WatchOrdersProvider = WatchOrders.provide.with(
  () =>
    async function* (input, invocation) {
      const subscription = await subscribe(input, { signal: invocation.signal });

      try {
        for await (const event of subscription) {
          yield ok(event);
        }
      } finally {
        await subscription.close();
      }
    }
);
```

Non è sufficiente aggiungere `AsyncIterable<Result<...>>` al return type delle operation attuali.
Una unary operation ha un completamento terminale osservato durante una singola chiamata; uno
stream restituisce subito un iterator che può restare attivo molto più a lungo della chiamata che
lo ha creato. Forma deve quindi possedere esplicitamente il lifetime dell'invocation streaming.

La direzione concordata è:

- introdurre modality `unary | stream` sul **Contract** (identity resta `(boundaryId, intentName)`);
- mantenere invariati grafo, Provider lifetime e lifetime inference (indipendenti dalla modality);
- aggiungere uno stream invocation lifetime posseduto dall’execution context;
- restituire dalla surface un `AsyncIterable` lazy, cold, single-consumer (con `AsyncDisposable`);
- chiudere gli stream attivi quando il consumer interrompe, l'execution context viene disposto o
  il relativo signal viene abortito (abort host ≠ dispose automatico);
- usare `Result<Item, Err>` come protocollo degli eventi, con `Err` terminale enforced dal wrapper;
- lasciare transport, reconnect, multicast e runtime schema a moduli costruiti sopra il core.

Questa estensione è particolarmente interessante per database cursor, subscription, filesystem
watch, Server-Sent Events, WebSocket e remote Adapter fullstack.

## Contesto attuale

Forma modella oggi un'operation unary:

```ts
type IntentOperation<Input, Success, Err> = (
  input: Input
) => Result<Success, Err> | Promise<Result<Success, Err>>;
```

La surface può mantenere un lease sull'execution context per l'intera invocation:

```text
enter → materialize Provider → invoke operation → await result → leave
```

Questo garantisce che il dispose attenda il lavoro già accettato. Provider e operation hanno
responsabilità diverse:

- il Provider viene materializzato una volta per il proprio effective lifetime;
- l'operation può essere invocata più volte;
- `Lifetime.onDispose` appartiene all'istanza del Provider;
- il lease della surface appartiene alla singola invocation.

Un async generator modifica l'ultimo punto. Chiamare una generator function restituisce
immediatamente un iterator; il corpo viene eseguito soltanto al primo `next()`:

```ts
const stream = operation(input); // non consuma lo stream
```

Se Forma rilasciasse il lease subito dopo questa riga, l'execution context potrebbe disporre i
Provider mentre lo stream li sta ancora usando.

## Distinzione fondamentale

Esistono almeno tre possibili significati di `yield`; soltanto uno è in scope.

### Yield dell'operation: in scope

Ogni `yield` è un elemento dello stream:

```ts
async function* watch(input, invocation) {
  yield ok(firstEvent);
  yield ok(secondEvent);
}
```

### Yield della Provider factory: fuori scope

Non viene proposto che una Provider factory produca più operation o più istanze attraverso yield
successivi. Il Provider continua a materializzare una sola operation, sincrona o asincrona.

### Yield di Intent come effect: fuori scope

Non viene proposta una forma del tipo:

```ts
function* provider() {
  const db = yield ConnectionIntent;
}
```

Dependency resolution dinamica indebolirebbe grafo chiuso, cycle detection, lifetime inference,
`describePlan()` e controlli type-level. Sarebbe un effect system differente dalla tesi attuale di
Forma.

## Obiettivi

1. Rappresentare stream pull-based con gli standard JavaScript `AsyncIterable` e
   `AsyncIterator`.
2. Conservare la distinzione statica fra operation unary e streaming.
3. Mantenere il grafo chiuso e tutte le attuali garanzie di Composition.
4. Rendere lo stream una risorsa posseduta dall'execution context.
5. Propagare cancellation al lavoro per-invocation, anche quando il Provider è
   composition-effective.
6. Garantire cleanup su completion, errore, `break`, dispose e abort.
7. Mantenere lazy sia la materializzazione del Provider sia l'avvio dello stream.
8. Nascondere la complessità del lifecycle dietro la normale interface `AsyncIterable`.
9. Lasciare aperta l'integrazione con transport remoti senza introdurla nel core.

## Non-obiettivi iniziali

- stream push-based o un sistema Observable/Rx nel core;
- duplex stream;
- multicast, replay o condivisione automatica fra consumer;
- reconnect e retry policy;
- batching e buffering configurabile;
- dependency resolution dinamica tramite generator;
- serializzazione o runtime schema;
- introduzione immediata di scope nominati o annidati;
- supporto distinto per generator sincroni: la baseline usa sempre `AsyncIterable`.

## Modello pubblico proposto

### Intent modality esplicita

Unary e streaming devono essere distinguibili nel tipo dell'Intent:

```ts
const GetOrder = Orders.intent("getOrder").contract<OrderId, Order, GetOrderError>();

const WatchOrders = Orders.stream("watchOrders").contract<
  WatchOrdersInput,
  OrderEvent,
  WatchOrdersError
>();
```

Sintassi concordata: `boundary.stream(name).contract<...>()` (e `boundary.intent` resta unary).
La modality è fissa sul **Contract**, non sull’identity e non dedotta dal return type a runtime.

Una union implicita è da evitare:

```ts
// Non proposto
type OperationResult<S, E> = Result<S, E> | Promise<Result<S, E>> | AsyncIterable<Result<S, E>>;
```

Con questa union il caller non saprebbe staticamente se usare `await` o `for await`.

### Stream operation

Forma target (v1):

```ts
type StreamInvocation = {
  readonly signal: AbortSignal;
};

type StreamOperation<Input, Item, Err> = (
  input: Input,
  invocation: StreamInvocation
) => AsyncIterable<Result<Item, Err>>;
```

`StreamInvocation` in v1 espone solo `signal` (niente metadata). Le unary restano
`(input) => Result | Promise<Result>` — nessun secondo argomento in v1.

`StreamInvocation.signal` è distinto da `Lifetime.signal`:

- `Lifetime.signal` appartiene all'istanza del Provider;
- `StreamInvocation.signal` appartiene alla singola stream invocation;
- ogni invocation signal è subordinato al signal dell'execution context;
- interrompere un singolo stream abortisce la sua invocation senza abortire l'intero context.

La distinzione è necessaria per Provider composition-effective: l'istanza può vivere quanto la
root, ma ogni stream da essa prodotto deve comunque terminare con il context che lo ha invocato.

### Surface

La surface distingue unary e streaming:

```ts
const result = await execution.surface.getOrder(input);

const stream = execution.surface.watchOrders(input);
for await (const event of stream) {
  // ...
}
```

La stream surface operation restituisce sincronicamente un `AsyncIterable` (non un
`AsyncIterableIterator` pubblico). Il wrapper interno gestisce `return()`; il consumer tipico
usa `for await` / `break`. L’iterable implementa anche `[Symbol.asyncDispose]` sullo stesso
path di cleanup. Provider materialization e apertura dello stream avvengono al primo `next()`.
Restituire `Promise<AsyncIterable<...>>` costringerebbe a una forma meno naturale:

```ts
// Da evitare
for await (const event of await execution.surface.watchOrders(input)) {
}
```

Garanzie pubbliche: cold + single-consumer:

- la prima iterazione ne prende ownership;
- una seconda iterazione dello stesso valore fallisce chiaramente;
- due chiamate alla surface producono due stream indipendenti;
- multicast/replay non sono nel core; eventuale condivisione I/O sotto il cofano resta dettaglio
  del Realization, non API Forma.

## Semantica degli eventi e degli errori

Protocollo concordato:

```ts
AsyncIterable<Result<Item, Err>>;
```

Regole:

- `ok(item)` emette un elemento;
- `err(error)` rappresenta un errore atteso ed è terminale;
- completion dell'iterator rappresenta fine normale;
- un `throw` rappresenta un errore inatteso;
- nessun elemento è ammesso dopo `err`;
- gli errori di cleanup riutilizzano la matrice disposal già usata da Forma
  (`SuppressedError` / `AggregateError` dove già applicabile) — niente policy ad hoc solo per
  gli stream;
- in v1 non c’è timeout se un generator ignora cancellation e non completa `return()`: ci si
  affida ad abort + cooperazione; eventuali hang-timeout restano policy host.

Il wrapper **enforce** “Err terminale”: dopo il primo `err` chiama `return()` sull’iterator
interno, così yield successivi non sono osservabili.

Non viene usato il return value finale del generator per rappresentare un risultato: `for await`
non lo espone in modo ergonomico al consumer.

## Ownership e lifecycle

### Due lifetime distinti

```text
Provider effective lifetime
└── zero o più stream invocation lifetime
```

Il Provider lifetime governa:

- factory e operation instance;
- cache e inflight materialization;
- risorse registrate con `Lifetime.onDispose`.

Lo stream invocation lifetime governa:

- iterator;
- signal della singola subscription;
- risorse aperte dentro la generator function;
- lease sull'execution context;
- cleanup su completion o cancellation.

Una risorsa condivisa fra invocation appartiene al Provider. Una subscription, cursor o reader
creato per un singolo input appartiene allo stream.

### Lazy start

Creare uno stream senza iterarlo non deve:

- materializzare il Provider;
- acquisire un lease;
- registrare uno stream attivo;
- aprire risorse.

Il primo `next()` esegue atomicamente:

1. verifica che l'execution context sia ancora open;
2. prende il lease;
3. registra lo stream attivo;
4. crea il per-stream `AbortController` collegato al context signal;
5. materializza il Provider;
6. invoca la StreamOperation;
7. inoltra `next()` all'iterator interno.

Una race fra primo `next()` e dispose deve produrre un solo esito: stream accettato e poi chiuso,
oppure rifiuto perché il context non è più open.

### Completion naturale

Quando l'iterator interno completa:

1. viene rimosso dal registro degli stream attivi;
2. il per-stream controller viene abortito/chiuso;
3. il lease viene rilasciato una sola volta.

### Interruzione del consumer

Quando il consumer esegue `break`, `return()` o abbandona tramite un errore nel loop, il wrapper:

1. abortisce il per-stream signal;
2. chiama `return()` sull'iterator interno;
3. attende il `finally` del generator;
4. rilascia registration e lease.

`return()` deve essere idempotente dal punto di vista del wrapper.

### Dispose dell'execution context

Il dispose deve evitare deadlock con stream infiniti. Non può attendere passivamente che gli
stream terminino.

Ordine proposto:

```text
mark context disposing
→ abort context signal
→ prevent new invocations
→ abort + return() di tutti gli stream attivi
→ wait stream cleanup
→ wait unary invocations già accettate
→ dispose context-owned Providers
→ context disposed
```

Questo requisito probabilmente richiede di distinguere il lifecycle delle invocation dal
`ProviderScope`. Oggi il Provider scope possiede anche i lease delle surface call; per lo streaming
è più chiaro introdurre un execution lifecycle che possieda unary invocation e stream registry,
lasciando al Provider scope materializzazione e risorse dei Provider.

### Dispose della root

Resta valido l'ordine attuale:

```text
root disposing
→ close all execution contexts (inclusi stream attivi)
→ dispose composition-effective Providers
→ root disposed
```

### Host abort

Il signal fornito a `openExecutionContext` continua a confluire nel context signal. L'abort:

- abortisce tutti gli invocation signal derivati;
- deve sbloccare I/O cooperativo dentro gli stream;
- **non** avvia automaticamente `dispose()` del context (abort ≠ dispose; coerente con ADR 0008).

Con `withExecutionContext`, il dispose nel `finally` chiude comunque gli iterator attivi.

## Active stream registry

Serve un modulo interno profondo con una piccola interface, ad esempio:

```ts
type StreamRegistry = {
  open<T>(start: (signal: AbortSignal) => AsyncIterator<T>): AsyncIterableIterator<T>;
  closeAll(): Promise<void>;
};
```

La forma definitiva può differire, ma il modulo deve nascondere:

- stato `idle | starting | active | closing | closed` di ogni wrapper;
- single-consumer enforcement;
- context e per-stream AbortController;
- forwarding di `next`, `return` e `throw`;
- active registration;
- release-once del lease;
- close concorrenti;
- composizione degli errori;
- race fra start, completion e context dispose.

L'execution context non dovrebbe manipolare direttamente set di iterator, controller e promise.

## Provider, Adapter e alias

### Provider

Uno Stream Provider produce una `StreamOperation`, non direttamente un iterator. Stesso percorso
ergonomico `.provide.with` / Adapter `.adapt`: l’operation type è guidato dalla modality del
Contract, senza un secondo DSL. La stessa operation instance può creare più iterator
indipendenti:

```ts
const WatchOrdersProvider = WatchOrders.provide.with(
  ({ deps }) =>
    async function* (input, invocation) {
      // una nuova invocation per ogni chiamata alla surface
    }
);
```

Provider lifetime inference non cambia: dipende dal grafo delle dependency, non dalla modality
dell'Intent.

`using` ammette Intent stream: il dependency materializzato è la `StreamOperation` (factory di
iterable), non un iterator già aperto. Aprire uno stream resta una nuova invocation (surface
wrapper, o footgun del Realization se fatto fuori dal registry).

### Adapter

`Adapter.adapt()` deve preservare la modality dell'Intent target:

- unary Intent → unary Provider builder;
- Stream Intent → stream Provider builder.

Un remote Adapter può produrre un async iterator che decodifica eventi da un transport.

### Intent alias

Gli alias sono ammessi soltanto fra Intent con modality e contratto compatibili:

- unary → unary;
- stream → stream;
- stessi Input, Item/Success ed Err secondo le regole strutturali esistenti.

Unary → stream e stream → unary devono fallire a compile time.

## Piano e introspezione

`describePlan()` espone la modality (`mode: "unary" | "stream"`) su **tutti** gli Intent
registrati (surface e wiring), non solo sulla surface:

```ts
{
  intent: ["orders", "watchOrders"],
  mode: "stream",
  declared: "auto",
  effective: "context"
}
```

La modality è proprietà del Contract, non del Provider. Renderla visibile aiuta:

- graph visualization;
- transport manifest;
- architecture test;
- individuazione di stream anche privati;
- future verifiche su stream composition-effective.

Il piano descrive capability statiche; gli iterator attivi sono runtime state e non appartengono
al risultato immutabile di `describePlan()`. Eventuale runtime inspection dovrebbe avere una
interface separata.

## Implicazioni fullstack

La forma si presta a un remote Adapter:

```text
Server Stream Intent
→ AsyncIterable<Result<Event, Err>>
→ SSE / WebSocket / streamed HTTP
→ Client remote Adapter
→ AsyncIterable<Result<Event, Err>>
```

Il core Forma dovrebbe definire soltanto ownership e protocollo dell'iterator. Un modulo transport
separato governa:

- runtime schema e serializzazione;
- framing degli eventi;
- reconnect e resume token;
- heartbeat;
- mapping errori di rete;
- autenticazione e authorization transport;
- backpressure disponibile sul transport scelto.

La cancellazione deve propagarsi in entrambe le direzioni:

```text
consumer break / context dispose
→ client iterator.return()
→ transport cancel
→ server iterator.return() + abort
→ generator finally
```

Un prototipo fullstack è utile come validazione, ma non fa parte del primo incremento del core.

## Alternative considerate

### `Success = AsyncIterable<Item>` su un Intent unary

```ts
Intent<Input, AsyncIterable<Item>, Err>;
```

Vantaggio: nessun nuovo tipo di Intent.

Problemi:

- Forma non riconosce che il successo porta un lifecycle lungo;
- l'execution context rilascia il lease troppo presto;
- cancellation e active stream ownership restano responsabilità del caller;
- `Err` può descrivere soltanto l'avvio, non gli errori attesi durante lo stream;
- `describePlan()` non può distinguere la modality.

È possibile come escape hatch manuale, ma non offre garanzie streaming.

### Union fra unary result e stream

Riduce i tipi dichiarati, ma sposta il branching su tutti i caller e rende meno profonda
l'interface della surface. Rifiutata come direzione iniziale.

### Promise di AsyncIterable

Semplifica la materializzazione asincrona, ma peggiora l'uso e separa artificialmente “open” e
“iterate”. Un iterable lazy può nascondere entrambe dietro il primo `next()`.

### Return value terminale del generator

`for await` non espone ergonomicamente il return value. Usare un `Result` yielded e terminale è più
compatibile con il normale protocollo di consumo.

### Observable nel core

Gli Observable risolvono casi importanti, soprattutto push e multicast, ma introdurrebbero un
protocollo non standard e policy aggiuntive. Un Adapter può convertire fra Observable e
AsyncIterable senza imporre la dipendenza a Forma.

## Piano di sviluppo

### Fase 0 — Spike isolato + ADR

Obiettivo: validare la state machine e le ergonomics TypeScript contro le **Decisioni chiuse**,
senza modificare il runtime principale.

- costruire un wrapper `ManagedAsyncIterator` sperimentale (incluso `[Symbol.asyncDispose]`);
- verificare `next`, `return`, `throw`, abort e cleanup concorrente;
- verificare il comportamento reale di async generator bloccati su I/O;
- verificare enforcement di `Err` terminale e riuso della matrice errori disposal;
- registrare l’ADR di integrazione solo a valle dello spike (nessun ADR “a vuoto” prima).

Criterio di uscita: state machine e matrice degli errori documentate e testate; ADR allineato
alle Decisioni chiuse.

### Fase 1 — Modello type-level

- aggiungere la modality all'Intent;
- introdurre `StreamOperation`, `StreamInvocation` e Stream Provider;
- derivare correttamente unary e stream surface operation;
- preservare modality in Adapter e alias;
- rifiutare alias cross-modality;
- mantenere invariati Params e lifetime inference;
- aggiungere compile-time tests attraverso l'interface pubblica.

Criterio di uscita: nessun cambiamento al comportamento unary e inferenza stabile.

### Fase 2 — Execution lifecycle separato (prerequisito vincolante)

Prerequisito prima del registry stream: senza questo seam, lease e materialize restano aggrovigliati.

- separare i lease delle invocation dal `ProviderScope`;
- introdurre uno stato dell'execution context che rifiuta nuovo lavoro dopo `disposing`;
- mantenere il comportamento unary esistente sul nuovo execution lifecycle;
- testare disposal concorrente e root backstop prima di aggiungere stream.

Criterio di uscita: tutti i test unary esistenti verdi senza compatibilità speciale.

### Fase 3 — Stream registry e surface wrapper

- implementare il modulo `StreamRegistry` / managed iterator;
- creare stream surface lazy (`AsyncIterable` + `AsyncDisposable`);
- materializzare il Provider al primo `next()`;
- creare e propagare il per-stream signal;
- registrare e chiudere gli stream attivi;
- enforce `Err` terminale nel wrapper;
- comporre errori di iteration e cleanup con la matrice disposal esistente;
- integrare context e root dispose.

Criterio di uscita: nessuna risorsa o lease rimane attivo dopo ogni terminal path.

### Fase 4 — Plan, diagnostics e documentazione

- aggiungere `mode` a `describePlan()`;
- documentare unary vs stream lifecycle;
- aggiungere un esempio `WatchOrders` a `forma-demo`;
- aggiungere diagnostici per modality incompatibili;
- aggiornare README, glossario e ADR correlati.

Criterio di uscita: un utente può capire ownership e cancellation senza conoscere il runtime
interno.

### Fase 5 — Remote Adapter spike

Fuori dal core iniziale, ma utile per validare il modello:

- trasportare uno Stream Intent con SSE o WebSocket;
- propagare `return()` e abort client → server;
- usare uno schema runtime esplicito;
- verificare expected error, disconnect e cleanup server;
- confrontare comportamento locale e remoto attraverso la stessa interface.

Criterio di uscita: il remote Adapter non richiede eccezioni al modello del core.

## Matrice minima dei test

### Avvio e consumo

- creare senza iterare non materializza il Provider;
- il primo `next()` materializza una sola volta;
- più `next()` producono più elementi;
- completion naturale rilascia lease e registration;
- due surface call producono stream indipendenti;
- una seconda iterazione dello stesso stream fallisce chiaramente.

### Cancellation

- `break` e `[Symbol.asyncDispose]` chiamano `return()` e il generator `finally`;
- `return()` esplicito è idempotente;
- context dispose chiude tutti gli stream attivi;
- root dispose chiude context, stream e poi Provider root-owned;
- host abort raggiunge `StreamInvocation.signal` senza auto-dispose del context;
- cancellare uno stream non abortisce gli altri né il context;
- stream da Provider composition-effective usa comunque il per-context invocation signal.

### Errori

- `err` viene emesso una volta e termina (wrapper enforce);
- yield dopo `err` non è osservabile;
- throw prima del primo yield rifiuta `next()` e pulisce;
- throw dopo più yield rifiuta il `next()` corrente e pulisce;
- cleanup failure viene propagato;
- iteration failure + cleanup failure riusa la composizione errori del dispose;
- Provider materialization failure non registra uno stream attivo residuo.

### Concorrenza e race

- dispose durante il primo `next()`;
- dispose durante un `next()` bloccato;
- `return()` concorrenti condividono la chiusura;
- completion e context dispose concorrenti rilasciano una sola volta;
- più stream sullo stesso Provider non interferiscono;
- unary invocation e stream concorrenti vengono entrambi drenati.

### Tipi e composizione

- unary surface richiede `await` e stream surface supporta `for await` / `await using`;
- Stream Provider soddisfa solo Stream Intent; stesso `.provide` / `.adapt`;
- `using` di Stream Intent risolve a `StreamOperation`;
- Adapter preserva modality;
- alias cross-modality viene rifiutato;
- grafo chiuso e lifetime inference restano invariati;
- `describePlan()` riporta `mode` su tutti gli Intent registrati.

## Decisioni chiuse

Target concordato (grill). Validate dallo spike Fase 0; vincolanti per il core via
[ADR 0012](./adr/0012-streaming-intents.md). Riaprire solo con un nuovo trade-off esplicito.

1. **Sintassi:** `boundary.stream(name).contract<...>()`; `boundary.intent` resta unary.
2. **Surface type:** `AsyncIterable<Result<Item, Err>>` (+ `[Symbol.asyncDispose]`); non
   `AsyncIterableIterator` pubblico.
3. **`Err` terminale:** enforced nel wrapper (`return()` dopo il primo `err`).
4. **`StreamInvocation` v1:** solo `{ signal: AbortSignal }`.
5. **Unary v1:** invariata — nessun invocation bag sulle unary nel primo ship.
6. **Host abort:** propaga i signal; non avvia `dispose()` del context (abort ≠ dispose).
7. **Matrice errori:** riusa la composizione disposal esistente (`SuppressedError` /
   `AggregateError` dove già usato); documentata e testata nello spike.
8. **Hang / non-cooperazione:** nessun timeout nel core v1.
9. **Cold + single-consumer:** garanzia pubblica del core; multicast/replay fuori scope;
   condivisione I/O interna = dettaglio del Realization.
10. **`describePlan()`:** `mode` su tutti gli Intent registrati (surface + wiring).
11. **Modality:** sul Contract; identity resta `(boundaryId, intentName)`.
12. **Ownership:** ogni stream invocation è posseduta dall’execution context.
13. **Execution lifecycle ≠ `ProviderScope`:** prerequisito (Fase 2) prima del registry.
14. **`using`:** Stream Intent ammesso; dep = `StreamOperation`, non iterator aperto.
15. **Builder:** stesso `.provide` / `.adapt`; operation shape dalla modality.

## Criteri di accettazione complessivi

La feature è pronta quando:

- unary behavior e compatibilità rimangono invariati;
- la modality è nota staticamente a Intent, Provider, Adapter, alias e surface;
- nessuno stream sopravvive al proprio execution context;
- context e root dispose non possono bloccarsi passivamente su stream infiniti cooperativi;
- ogni terminal path esegue cleanup e release esattamente una volta;
- un Provider composition-effective può produrre stream correttamente context-owned;
- il consumer usa il protocollo standard `for await` / `await using`;
- `describePlan()` rende la modality ispezionabile su tutti gli Intent registrati;
- un remote Adapter può preservare la stessa interface senza modifiche al core.

## Valutazione

Gli Stream Intent rafforzano la tesi di Forma: la Composition non descrive soltanto come costruire
operation, ma governa ownership e lifecycle delle capability esposte. Il valore non è aggiungere
una sintassi generator; è nascondere cancellation, cleanup e race dietro una piccola interface
standard.

La feature merita uno sviluppo incrementale perché rende esplicito un nuovo livello di lifetime.
Se implementata come semplice union di return type, indebolirebbe le garanzie attuali. Se invece
viene trattata come modality del Contract con stream invocation ownership sull’execution context,
apre in modo coerente streaming locale, subscription e remote Adapter fullstack.
