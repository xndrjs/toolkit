# Totalizzazione degli errori in uscita dai Boundary

> Stato: **implementato** (normativa in [ADR 0015](./adr/0015-boundary-error-totalization.md);
> emendamenti [ADR 0008](./adr/0008-execution-seed-and-abort-signal.md) e
> [ADR 0012](./adr/0012-streaming-intents.md)). Questo documento resta l'analisi estesa e il piano
> di validazione.
>
> Data: 2026-10-31.
>
> Scope: errori prodotti durante l'invocazione di Intent unary e stream, propagazione fra
> Boundary, ruolo degli Adapter, identita delle failure e fallback diagnostico della Composition.
> Gli errori di lifecycle (`dispose`, cleanup e shutdown) rimangono fuori scope.

## Executive summary

Il Contract di un Intent dichiara oggi `Success` ed `Err`, ma un'operation puo anche terminare
tramite throw o Promise rejection. `Err` rappresenta gli errori attesi e censiti; il canale
eccezionale rappresenta invece errori inattesi che TypeScript non descrive nel tipo di una
`Promise`.

Questa separazione costringe ogni Boundary chiamante a conoscere due protocolli:

```text
Invocation
├─ Result<Success, Err>  ← tipizzato
└─ throw / rejection    ← unknown e non tipizzato
```

Di conseguenza, il solo Contract non basta per usare correttamente un Intent. Un consumer che
vuole essere difensivo deve aggiungere `try/catch` a ogni attraversamento, ma nel `catch` riceve un
`unknown` del quale non conosce cause, provenienza o possibilita di recovery.

La decisione proposta e rendere **totale l'uscita di ogni Boundary**:

> Un throw o una rejection prodotti dall'implementazione di un Boundary non attraversano il
> Boundary. Forma li converte in un ramo `unexpected` con un `failureId` opaco generato nel punto
> di origine.

Il protocollo target e `InvocationOutcome`:

```ts
type InvocationOutcome<Success, ExpectedError> =
  | {
      readonly kind: "success";
      readonly value: Success;
    }
  | {
      readonly kind: "error";
      readonly error: ExpectedError;
    }
  | {
      readonly kind: "unexpected";
      readonly failure: UnexpectedFailure;
    }
  | {
      readonly kind: "cancelled";
      readonly cancellation: Cancellation;
    };
```

Questa analisi decide la semantica di `success`, `error` e `unexpected`. La normalizzazione
completa della cancellazione nello stesso protocollo e collegata, ma richiede di emendare
separatamente le attuali decisioni su abort e lifecycle.

Il principio guida e:

> Errore gestibile semanticamente = errore censito nel Contract.

Un `UnexpectedFailure` consente soltanto propagazione e policy generiche. Non trasporta il
`cause`, quindi un Boundary chiamante non puo tentare recovery basata su dettagli
dell'implementazione del Boundary chiamato.

## Baseline precedente (pre-implementazione)

Prima della totalizzazione il modello pubblicato usava:

```ts
type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

Le unary operation potevano restituire il `Result` sincronicamente o tramite Promise; le stream
operation esponevano `AsyncIterable<Result<Item, Err>>`. Il Glossary trattava gli unexpected
technical failure come fuori Contract; ADR 0012 lasciava il throw della sorgente stream nel
canale eccezionale dell'iterator.

Quel modello e stato sostituito da `InvocationOutcome` (ADR 0015). Glossary, README, ADR 0008,
ADR 0012 e architectural review sono stati emendati insieme all'implementazione.

## Problema semantico

### Il Contract non descrive l'intera invocation

Dato:

```ts
const GetOrder = Orders.intent("getOrder").contract<OrderId, Order, FindOrderError>();
```

il chiamante vede `FindOrderError` e puo gestirlo esaustivamente. Il tipo non dice invece che la
Promise puo rigettare con:

- un errore del database;
- un errore di rete;
- un `TypeError` dell'implementazione;
- un valore non-`Error` lanciato da una dipendenza;
- una failure avvenuta durante la materializzazione del Provider;
- qualunque altro `unknown`.

Il consumer e quindi incentivato a scrivere:

```ts
try {
  const result = await getOrder(orderId);
  // Gestione tipizzata di FindOrderError.
} catch (cause) {
  // Nessuna informazione type-level affidabile.
}
```

Questo indebolisce il valore del Contract proprio sul seam fra Boundary.

### Il problema appartiene al Boundary, non alla Surface

La garanzia non deve essere una proprieta speciale della Surface. I Boundary attraversano altri
Boundary anche nel wiring privato della Composition. Se soltanto la Surface catturasse i throw,
un Provider continuerebbe a dover aggiungere `try/catch` attorno a ogni dependency operation.

La proprieta deve quindi valere su ogni operation ottenuta da un Intent:

```text
Boundary A
  → dependency operation di Boundary B
    → InvocationOutcome, mai throw/rejection dell'implementazione B
```

La Surface eredita la proprieta perche espone root appartenenti agli Entry Boundary; non e il
punto nel quale la proprieta nasce.

## Protocollo target

### Expected error

Il ramo `error` contiene esclusivamente errori attesi e censiti nel Contract:

```ts
type FindOrderError =
  | { readonly kind: "not_found"; readonly orderId: OrderId }
  | { readonly kind: "access_denied" };
```

Il caller puo interpretarli e applicare recovery di dominio:

```ts
switch (outcome.kind) {
  case "error":
    return handleFindOrderError(outcome.error);
}
```

Se una condizione richiede una reazione semantica distinta, quella condizione deve entrare in
`Err`. Non deve essere riconosciuta tramite `instanceof` dentro un `catch` del Boundary chiamante.

### Unexpected failure

Il ramo `unexpected` comunica che l'invocation non e riuscita per una causa non censita:

```ts
type UnexpectedFailure = Readonly<{
  readonly id: FailureId;
}>;
```

Il valore non espone:

- `cause`;
- `message`;
- `stack`;
- error class o prototype;
- dettagli del Boundary produttore;
- dati di input o Params.

Il consumer puo:

- propagare la stessa failure;
- interrompere il proprio flusso;
- applicare una policy generica;
- mostrare il `failureId` come riferimento di assistenza;
- trasformarla in una risposta generica del proprio host.

Non puo classificare la causa concreta. Se quella classificazione e necessaria, deve avvenire nel
Boundary che possiede l'integrazione e deve produrre un errore atteso.

### Il `cause` non attraversa il Boundary

Il core usa il `cause: unknown` soltanto mentre converte il canale eccezionale nel protocollo
totalizzato. Oltre il Boundary passa soltanto `UnexpectedFailure`.

Questa regola evita che dettagli come `PostgresError`, `RedisError`, `DOMException` o errori di
SDK diventino dipendenze accidentali dei Boundary chiamanti.

Un Boundary puo osservare deliberatamente la causa prima che esca dalla propria implementazione,
per esempio per produrre un record diagnostico censito. Se usa un Intent di logging appartenente a
un altro Boundary, il raw `unknown` non deve attraversarlo implicitamente: l'implementazione deve
prima mapparlo nel Contract diagnostico che ha deciso di esporre. In alternativa puo chiamare
direttamente un SDK locale all'implementazione.

L'hook privilegiato della Composition descritto piu avanti riceve il raw cause fuori dal normale
dataflow degli Intent. Non lo rende disponibile ai Provider o agli altri Boundary.

## Identita della failure

### Failure ID come correlation token della singola failure

Il `failureId` identifica una failure, non una request e non un execution context. Una request puo
avere un `traceId` e produrre zero o piu failure distinte:

```text
trace req-91
└─ Orders
   └─ Inventory
      └─ Redis
         └─ failure fail-42
```

Quando la failure risale il grafo, conserva la propria identita:

```text
Redis crea fail-42
  → Adapter propaga fail-42
    → Inventory propaga fail-42
      → Orders propaga fail-42
        → Surface restituisce fail-42
```

La regola e:

> Propagare una failure conserva il suo ID. Una nuova causa genera un nuovo ID.

Non vengono introdotti inizialmente parent ID, `causedBy` o un failure graph. Queste relazioni
appartengono a un eventuale sistema di observability, non al protocollo minimo di Forma.

### Nessun registry nel core

Forma non mantiene una struttura del tipo:

```ts
Map<FailureId, unknown>;
```

Non esiste quindi un sink da svuotare o un buffer da drenare. Il lifecycle del token e quello di
un normale valore immutabile:

1. nasce nel punto di origine;
2. viene eventualmente associato a un log;
3. viene propagato dentro gli outcome;
4. diventa raccoglibile quando non esistono piu riferimenti.

La retention di log, eventi Sentry o trace appartiene ai rispettivi sistemi esterni.

### Factory, non classe Error

La forma raccomandata e:

```ts
const failure = createUnexpectedFailure();
```

Non:

```ts
const failure = new UnexpectedFailure();
```

`UnexpectedFailure` e un token dati, non un'eccezione. Una classe incoraggerebbe usi sbagliati
come `throw new UnexpectedFailure()` e introdurrebbe semantiche di prototype e `instanceof` che
non devono attraversare Boundary o transport remoti.

La factory permette al core di:

- generare uniformemente un ID opaco ad alta entropia;
- applicare un brand nominale;
- congelare il descrittore;
- cambiare in futuro il formato interno;
- mantenere una rappresentazione serializzabile.

Il Boundary ha controllo sul `failureId` nel senso che puo creare il token prima di loggare e
riutilizzarne l'ID. Non viene proposta una factory pubblica che accetti ID arbitrari. Una futura
integrazione remota potra avere una primitive dedicata e validata per reidratare un ID ricevuto
dal transport.

## Due percorsi di origine

### Failure esplicita, posseduta dal Boundary

Un Boundary infrastrutturale conosce il protocollo della libreria che racchiude. Deve convertire
le condizioni riconosciute in errori attesi e puo assumere ownership diagnostica delle altre:

```ts
try {
  const row = await postgres.query(query);
  return success(mapRow(row));
} catch (cause) {
  if (isUniqueViolation(cause)) {
    return expectedError({
      kind: "unique_violation",
      constraint: cause.constraint,
    });
  }

  const failure = createUnexpectedFailure();

  await logUnexpected({
    failureId: failure.id,
    diagnostic: toDiagnosticRecord(cause),
  });

  return unexpected(failure);
}
```

Il Boundary ha creato esplicitamente la failure e ne possiede il reporting. La Composition non
deve notificare nuovamente la stessa origine, altrimenti ogni failure verrebbe loggata due volte.

Un eventuale fallimento del logging non deve sostituire la failure originaria. La policy del
logging rimane responsabilita applicativa.

### Fallback automatico del core

Un Provider puo comunque contenere un bug o lasciare sfuggire un'eccezione non prevista:

```ts
const Provider = SomeIntent.provide.with(
  () =>
    async function operation() {
      throw new Error("boom");
    }
);
```

Forma deve chiudere anche questo canale:

```ts
try {
  return await operation(input);
} catch (cause) {
  const failure = createUnexpectedFailure();

  notifyComposition({
    failure,
    cause,
    origin,
    intent,
    phase: "invoke",
  });

  return unexpected(failure);
}
```

Questo fallback garantisce la correttezza del protocollo anche quando il Boundary non ha gestito
deliberatamente la causa. Se la Composition non configura alcun hook, Forma elimina il raw cause
dopo la conversione; non lo conserva in attesa di un futuro consumer.

## Hook di supervisione della Composition

### Motivazione

Se Forma deve contemporaneamente:

- contenere sempre un throw sfuggito;
- non propagare il raw cause nel grafo;
- non introdurre un sistema di logging nel core;

serve un punto opzionale nel quale l'host possa osservare la causa prima che venga eliminata. La
Composition e il posto coerente: possiede il runtime del grafo ma non e un Boundary applicativo.

L'hook non e un layer di observability. E una notifica di supervisione per il solo fallback del
core.

### Nome e forma

`onFailure(error, failureId)` e troppo generico e poco estendibile. Potrebbe sembrare relativo
anche a errori attesi, cancellation o dispose. La forma raccomandata e:

```ts
compose({
  entryBoundaries: [Orders],
  surface,
  wiring,

  onUnexpectedFailure(event) {
    Sentry.captureException(event.cause, {
      tags: {
        failureId: event.failure.id,
        boundary: event.intent[0],
        intent: event.intent[1],
        phase: event.phase,
      },
    });
  },
});
```

Un event object consente di evolvere i metadata senza modificare l'arita della callback:

```ts
type UnexpectedFailureEvent = Readonly<{
  readonly failure: UnexpectedFailure;
  readonly cause: unknown;
  readonly intent: IntentIdentity;
  readonly origin: ProviderOrigin;
  readonly phase: "materialize" | "invoke" | "stream-start" | "stream-next";
}>;
```

Input, Params e risultati parziali non vengono inclusi automaticamente per evitare leakage di
dati sensibili. Un'integrazione puo ottenere trace context applicativo tramite closure o
`AsyncLocalStorage`, senza trasformarlo in una responsabilita del core.

### Semantica esatta

`onUnexpectedFailure`:

- viene chiamato soltanto quando Forma crea automaticamente una failure da un throw/rejection;
- viene chiamato una volta, nel punto di origine;
- non viene chiamato per expected error;
- non viene chiamato per una failure creata esplicitamente dal Boundary;
- non viene chiamato quando una failure esistente viene propagata;
- non osserva errori di `dispose` o altri lifecycle failure;
- non accumula eventi e non richiede flush;
- non puo modificare l'`InvocationOutcome` restituito.

La callback deve essere sincrona e best-effort:

```ts
type OnUnexpectedFailure = (event: UnexpectedFailureEvent) => void;
```

Forma non attende Promise di reporting. Attenderle introdurrebbe latenza, backpressure, failure
competition e un nuovo lifecycle di drain nel core. L'integrazione esterna puo accodare
sincronicamente l'evento nel proprio SDK.

Se l'hook lancia, il runtime deve isolarne l'errore: non puo sostituire la failure originale,
riaprire il canale eccezionale o invocare ricorsivamente lo stesso hook. La delivery diagnostica
rimane best-effort.

Una Composition annidata possiede il proprio hook. Non esiste un observer globale di processo.

## Boundary infrastrutturali e Adapter

### Il catch appartiene al Boundary infrastrutturale

Gli Adapter di Forma collegano Boundary; non racchiudono direttamente le eccezioni dei driver.
Per esempio:

```text
Postgres driver
  ↓ puo lanciare
Postgres Boundary
  ↓ InvocationOutcome<Row, PostgresExpectedError>
Postgres → Orders Adapter
  ↓ InvocationOutcome<Order, FindOrderError>
Orders Boundary
```

E il Postgres Boundary a:

- chiamare il driver;
- intercettare le sue eccezioni;
- classificare quelle riconosciute nel proprio `Err`;
- creare un unexpected per quelle non riconosciute.

### L'Adapter preserva il protocollo totalizzato

L'Adapter non aggiunge `try/catch` attorno all'Intent sorgente, perche quell'Intent non rigetta per
failure della propria implementazione. Mappa soltanto i rami semanticamente trasformabili:

```ts
switch (sourceOutcome.kind) {
  case "success":
    return success(mapRowToOrder(sourceOutcome.value));

  case "error":
    return expectedError(mapPostgresError(sourceOutcome.error));

  case "unexpected":
    return sourceOutcome;

  case "cancelled":
    return sourceOutcome;
}
```

`unexpected` e `cancelled` conservano identita e non vengono reinterpretati come errori attesi.

Anche il codice di mapping dell'Adapter puo avere un bug. Un throw prodotto dall'Adapter deve
essere totalizzato prima di entrare nel target Boundary e genera una nuova failure, perche e una
nuova causa. L'evento di supervisione mantiene la `ProviderOrigin` precisa, distinguendo origine
Boundary e origine Adapter.

## Unary operation

Per una unary invocation, Forma deve totalizzare almeno:

- throw sincrono durante materializzazione del Provider;
- rejection della factory asincrona;
- throw sincrono dell'operation;
- rejection della Promise restituita dall'operation;
- throw di mapping dentro un Adapter;
- outcome inatteso di una dependency gia espresso come `unexpected`.

L'ultimo caso non genera una nuova failure: quando il Provider propaga l'outcome ricevuto deve
riutilizzarne il token, e il wrapper non deve sostituirlo. Forma non puo obbligare una callback
applicativa a propagare un risultato che decide deliberatamente di ignorare; helper e Adapter
devono pero rendere la propagazione invariata il percorso naturale. Gli altri casi creano una
nuova `UnexpectedFailure` nel punto in cui la causa entra per la prima volta nel protocollo
totalizzato.

Il caller puo quindi usare soltanto il Contract:

```ts
const outcome = await getOrder(orderId);

switch (outcome.kind) {
  case "success":
    return renderOrder(outcome.value);

  case "error":
    return renderFindOrderError(outcome.error);

  case "unexpected":
    return renderGenericFailure(outcome.failure.id);

  case "cancelled":
    return renderCancellation();
}
```

Non serve `try/catch` per proteggersi dall'implementazione del Boundary chiamato. Rimangono
possibili throw prodotti dal codice del caller dopo l'`await` o da precondizioni esterne al
protocollo di invocation.

## Stream operation

La stessa proprieta deve valere per gli stream. Il protocollo target diventa:

```ts
type StreamOperation<Input, Item, Err> = (
  input: Input,
  invocation: StreamInvocation
) => AsyncIterable<InvocationOutcome<Item, Err>>;
```

La semantica e:

- `success` puo comparire piu volte e rappresenta un item;
- `error` e terminale;
- `unexpected` e terminale;
- `cancelled` e terminale;
- il completamento naturale dell'iterator e il completamento corretto dello stream;
- un throw/rejection della sorgente durante start o `next()` diventa un terminal
  `unexpected`, non una rejection visibile al consumer.

Esempio:

```text
success(order-1)
success(order-2)
success(order-3)
unexpected(fail-42)
done
```

L'hook della Composition viene notificato una sola volta quando il wrapper converte il throw
della sorgente. La propagazione del terminal item non produce altri eventi.

Non rientrano in questa decisione:

- l'errore passato deliberatamente dal consumer a `iterator.throw(error)`;
- failure di cleanup dopo un consumer `break`;
- rejection di `[Symbol.asyncDispose]()`;
- errori durante context/root dispose.

Questi casi appartengono al protocollo del consumer o al lifecycle e devono conservare la matrice
di cleanup esistente finche una decisione separata non la modifica.

## Remote Adapter

Un `UnexpectedFailure` e serializzabile senza trasportare il raw cause:

```json
{
  "kind": "unexpected",
  "failure": {
    "id": "019a3f5f-02f1-7a31-b4b1-ef9c812cab44"
  }
}
```

Il server conserva il log locale associato allo stesso ID. Il client puo mostrare o riportare
l'ID, ma non puo dipendere da classi di errore server-side, stack o dettagli del driver.

Se il transport fallisce prima di ricevere una risposta, il Boundary infrastrutturale client crea
una nuova failure locale. Se riceve un `unexpected` valido dal server, ne conserva invece l'ID.

I codec runtime di `Success`, `Err` e del wire envelope rimangono responsabilita del Remote
Adapter o di un package costruito sopra Forma; non vengono aggiunti al core da questa modifica.

## Confine della garanzia

La totalizzazione riguarda failure recuperabili prodotte durante un'invocation accettata. Non
trasforma Forma in un runtime capace di catturare qualunque arresto del processo.

| Scenario                                         | Canale target                       |
| ------------------------------------------------ | ----------------------------------- |
| Condizione attesa dichiarata dal Contract        | `kind: "error"`                     |
| Provider factory lancia o rigetta                | `kind: "unexpected"`                |
| Unary operation lancia o rigetta                 | `kind: "unexpected"`                |
| Stream source lancia durante start/next          | terminal `kind: "unexpected"`       |
| Dependency restituisce unexpected                | stessa failure propagata            |
| Adapter mapping lancia                           | nuova failure unexpected            |
| `compose()` riceve una configurazione invalida   | throw di configurazione             |
| Uso di root/context gia disposed                 | lifecycle/precondition, fuori scope |
| `dispose()` o cleanup fallisce                   | rejection di lifecycle, fuori scope |
| Consumer lancia dopo aver ricevuto l'outcome     | errore del caller                   |
| OOM, process termination o fatal runtime failure | fuori dalle garanzie                |

`dispose()` puo quindi continuare a rigettare. Non e il Contract di un Boundary: e
un'operazione di ownership osservata dall'host o dal supervisor.

## Conseguenze sul software design

### Benefici

- Il Contract descrive tutti gli esiti recuperabili osservabili fra Boundary.
- I Provider non aggiungono `try/catch` difensivi a ogni dependency invocation.
- Gli errori attesi vengono modellati come dati invece di dipendere da classi eccezione.
- Le failure inattese mantengono una correlazione end-to-end senza esporre dettagli interni.
- Un Remote Adapter puo conservare la stessa semantica senza serializzare `unknown`.
- La Composition offre un fallback diagnostico senza introdurre logging nel core.
- La distinzione tra dominio, failure inattesa e lifecycle diventa esplicita.

### Costi e rischi

- E una modifica breaking di ogni operation type e di ogni consumer.
- `Result` e gli helper `ok` / `err` devono essere sostituiti o ridefiniti coerentemente.
- Ignorare un `InvocationOutcome` rimane possibile: la totalizzazione elimina rejection nascoste,
  non obbliga il caller a gestire ogni branch.
- Boundary che oggi usano throw come controllo di flusso devono censire le condizioni attese.
- Il fallback automatico perde il raw cause se non e configurato `onUnexpectedFailure`.
- L'hook di supervisione e best-effort e non garantisce delivery o flush.
- Stream e cancellazione richiedono una migrazione coordinata con le decisioni di lifecycle gia
  pubblicate.

## Non-obiettivi

Questa modifica non introduce:

- un logger Forma;
- un event bus diagnostico;
- buffering o retention delle failure;
- retry automatico;
- recovery automatica dagli unexpected;
- serializzazione generica degli Error JavaScript;
- una gerarchia pubblica di classi Error;
- gestione tipizzata degli errori di `dispose()`;
- causal graph fra failure;
- schema runtime automatico dei Contract;
- middleware o interceptor general-purpose.

## Invarianti da preservare

1. Un expected error e sempre rappresentato da `Err` e puo essere interpretato dal caller.
2. Un unexpected non espone il raw cause nel dataflow fra Boundary.
3. Ogni nuova failure riceve esattamente un nuovo ID.
4. Propagare una failure conserva oggetto e ID.
5. La conversione automatica notifica la Composition al massimo una volta.
6. Una failure creata esplicitamente non viene notificata nuovamente dal core.
7. L'hook della Composition non puo modificare o far rigettare l'invocation.
8. Un Adapter non trasforma un unexpected in un expected error.
9. Unary e stream condividono la stessa algebra degli esiti.
10. Lifecycle e configurazione restano canali separati dal Contract del Boundary.

## Criteri di accettazione

### Unary

- throw sincrono e rejection producono `unexpected` senza rejection al caller;
- factory failure produce `unexpected` sulla invocation che ne richiede la materializzazione;
- il failure ID e branded, immutabile e non vuoto;
- una dependency unexpected attraversa piu Boundary conservando lo stesso ID;
- expected error omonimi continuano a essere verificati dal Contract;
- il caller puo gestire esaustivamente `InvocationOutcome` senza `try/catch`.

### Composition hook

- riceve il raw cause e lo stesso failure object restituito al caller;
- viene chiamato una sola volta per una failure core-generated;
- non viene chiamato durante la propagazione;
- non viene chiamato per una failure esplicita;
- un hook che lancia non modifica l'outcome e non produce ricorsione;
- l'assenza dell'hook non cambia il risultato dell'invocation;
- Params e Input non vengono inclusi nell'evento.

### Adapter

- expected source error puo essere mappato nell'expected target error;
- unexpected e cancellation vengono propagati invariati;
- un mapping che lancia genera una nuova unexpected failure;
- l'Adapter non deve aggiungere `catch` attorno a una dependency operation Forma.

### Stream

- source throw prima del primo item produce un terminal unexpected;
- source throw dopo piu item produce un solo terminal unexpected;
- expected error e unexpected sono terminali;
- `next()` non rigetta per failure dell'implementazione sorgente;
- il Composition hook viene chiamato una sola volta al punto di origine;
- early break e dispose mantengono la matrice lifecycle corrente.

### Remote

- un unexpected remoto conserva il failure ID senza reidratare il cause;
- un transport failure locale crea un nuovo ID;
- payload malformati diventano failure locali del Boundary infrastrutturale client;
- il wire payload non contiene stack, prototype o dettagli non censiti.

## Impatto documentale

Aggiornato atomicamente con l'implementazione:

- `GLOSSARY.md`: Contract, InvocationOutcome, Expected Error, Unexpected Failure, Failure ID e
  semantica degli stream;
- README: esempi unary, Adapter, surface e stream;
- ADR 0012: source throw come terminal unexpected invece di iterator rejection;
- ADR 0008: rapporto fra abort/cancellation e `InvocationOutcome`;
- architectural review: superseded “technical failure fuori da Result”;
- esempi Adapter/demo (pass-through `unexpected` / `cancelled`);
- ADR 0015: decisione normativa sulla totalizzazione.

Questo documento rimane l'analisi estesa e il piano di validazione; ADR 0015 registra la
decisione normativa in forma breve.

## Sintesi delle decisioni condivise

1. La totalizzazione e una proprieta del Boundary; la Surface la eredita.
2. Il core converte throw e rejection sfuggiti in `unexpected` con failure ID generato al volo.
3. Un Boundary puo creare esplicitamente la failure, loggarne l'ID e restituirla.
4. `createUnexpectedFailure()` e preferito a una classe `UnexpectedFailure` costruibile con
   `new`.
5. Il raw cause non attraversa il normale dataflow fra Boundary.
6. Una failure propagata conserva lo stesso ID; una nuova causa crea un nuovo ID.
7. Forma non mantiene registry, buffer o sink diagnostici.
8. `onUnexpectedFailure` e un hook opzionale della Composition per le sole conversioni
   automatiche del core.
9. L'hook e sincrono, best-effort, chiamato una volta e incapace di alterare l'outcome.
10. Il catch dei driver appartiene al Boundary infrastrutturale; l'Adapter mappa i Contract e
    propaga gli unexpected invariati.
11. Unary e stream devono condividere lo stesso protocollo di failure.
12. `dispose()` e gli altri lifecycle failure restano rejection fuori dal Contract dei Boundary.
