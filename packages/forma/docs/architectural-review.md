# Forma: review architetturale e direzioni di design

> Stato: analisi di design, non ADR e non specifica normativa.
>
> Data: 2026-10-29.
>
> Scope: `packages/forma` e `apps/forma-demo` sul branch `feature/adapters`.

## Executive summary

Forma ha un nucleo promettente: rende il grafo applicativo esplicito, mantiene private le
realizzazioni, espone una Surface stretta e concentra risoluzione, lazy materialization e
lifecycle nella Composition.

La descrizione più precisa non è “framework DDD” né “IoC container general purpose”, ma:

> un linker applicativo tipato, con dependency injection scoped e façade esplicita.

Il modulo con più profondità è `compose`: dietro un'interfaccia piccola nasconde una quantità
significativa di comportamento e produce leverage per i caller e locality per chi mantiene il
runtime. Boundary, Intent e Adapter aggiungono soprattutto identità, policy architetturale e
provenance.

Lo stato alpha è appropriato. Prima di una stabilizzazione sono prioritari quattro interventi:

1. unificare la semantica dell'identità tra TypeScript e runtime;
2. trasformare root ed Execution context in vere state machine di lifecycle;
3. validare l'intero grafo, inclusi i cicli, al momento di `compose()`;
4. rendere la sicurezza statica utilizzabile anche quando il wiring viene modularizzato.

Sul fronte dell'interfaccia, due direzioni hanno un ritorno particolarmente alto:

- factory asincrone, necessarie per acquisire risorse reali senza spostare il lifecycle nei
  caller;
- `withExecutionContext`, come safe default per scope brevi, mantenendo
  `createExecutionContext()` per lifecycle posseduti dall'host.

Per le sostituzioni cross-boundary con contratti uguali, un Adapter passthrough è generalmente
più esplicito e semanticamente sicuro di `bind`. Binding può restare, ma solo come alias di
identità eccezionale e chiaramente documentato, non come meccanismo ordinario di wiring.

## Metodo e verifiche

La review ha incluso:

- tutti i sorgenti e i test di `packages/forma`;
- README, glossario e ADR;
- tutti i file di `apps/forma-demo`;
- build, lint e typecheck;
- esecuzione del demo;
- probe TypeScript e runtime isolati per casi non coperti dalla suite.

Risultati della baseline:

- build di `@xndrjs/forma`: pass;
- lint di `@xndrjs/forma`: pass;
- typecheck di `@xndrjs/forma`: pass;
- typecheck di `@xndrjs/forma-demo`: pass;
- test: 9 file, 52 test, tutti passati;
- demo: pass, incluso cleanup della connessione simulata.

I problemi riportati come confermati sono stati riprodotti separatamente. Le considerazioni
sull'interfaccia e sugli scenari futuri sono invece valutazioni di design.

## Modello concettuale osservato

### Intent

Un Intent è un token nominale associato a un contratto unario:

```ts
Input -> Result<Success, ExpectedError>
```

L'operazione può essere sincrona o asincrona. Gli errori tecnici inattesi rimangono fuori dal
`Result` e vengono espressi tramite throw o Promise rejection.

### Provider

Un Provider associa un Intent a:

- una factory;
- un insieme nominato di dipendenze Intent;
- un lifetime, composition-scoped oppure `.perContext()`;
- un'origine Boundary o Adapter.

Il Provider è l'entità operativa registrata nella Composition.

### Composition

La Composition:

- registra Provider e Binding;
- risolve le dipendenze per identità;
- definisce la Surface pubblica;
- materializza i Provider lazily;
- condivide o isola le istanze in base al lifetime;
- possiede i disposer.

### Surface e wiring

La Surface è il seam esterno del modulo composto. Il wiring è la sua implementazione privata.
Questa separazione è una delle decisioni migliori della libreria: il consumer riceve solo le
operazioni esplicitamente pubblicate e non può usare la Composition come service locator.

### Adapter

L'oggetto creato da `adapter(id, targetBoundary)` è soprattutto un namespace architetturale e
un builder con provenance. La realizzazione concreta al seam è il Provider restituito da
`.adapt(intent).with(...)`.

Questa distinzione è importante: l'Adapter di Forma acquista profondità reale solo se la sua
identità e la sua provenance vengono poi sfruttate da diagnostica, introspezione, tooling o
policy di composizione. Oggi `compose` non usa `origin` per la risoluzione.

## Valutazione per asse

| Asse                    | Valutazione                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Correttezza semantica   | Buona intenzione, ma l'identità statica e runtime divergono                          |
| Ergonomia               | Molto buona per grafi piccoli e inline; fragile nella modularizzazione               |
| Qualità della soluzione | Ottimo PoC; lifecycle e concorrenza non ancora production-grade                      |
| Potenza espressiva      | Forte su façade e integrazioni; stretta su risorse async e context data              |
| Testabilità             | Buona attraverso la Surface; mancano scenari concorrenti e di shutdown               |
| Evolvibilità            | Metadata promettenti per tooling, ma l'interfaccia pubblica esporta dettagli interni |

## Decisioni particolarmente riuscite

### Surface esplicita

La Surface produce least authority: un consumer vede soltanto ciò che la Composition sceglie di
pubblicare. I Provider presenti nel wiring non diventano accidentalmente un'interfaccia pubblica.

### Dipendenze dichiarate, non cercate

Le dipendenze vengono nominate tramite `using` e ricevute dalla factory. Non esiste un resolver
pubblico. Questo rende il grafo leggibile, analizzabile e testabile.

### Contratto posseduto dal target

Un Adapter realizza l'Intent del target senza ridefinirne il contratto. Nel demo la traduzione
tra shape Postgres e shape Orders resta localizzata nell'integrazione.

### Distinzione fra alias e trasformazione

Il design separa correttamente:

- Binding: riscrittura di identità a parità di contratto strutturale;
- Adapter: realizzazione con eventuale mapping di input, output ed errori.

La separazione è concettualmente solida, anche se più avanti viene proposta una restrizione
ulteriore dell'uso di Binding.

### Difesa dai captive dependency

Il divieto composition-lifetime -> per-context impedisce che un Provider longevo catturi una
dipendenza più corta. La difesa esiste sia nei tipi sia a runtime.

### Disposal LIFO

I cleanup vengono eseguiti in ordine inverso alla registrazione, tutti vengono tentati e gli
errori multipli vengono aggregati. Poiché le dipendenze vengono materializzate prima dei
consumer, il LIFO tende naturalmente a chiudere prima il consumer e poi le sue dipendenze.

### Inferenza locale

Input, output, errori e dipendenze vengono inferiti dall'Intent. Nei casi piccoli il caller non
deve duplicare annotazioni e la Surface risultante è precisa.

## Finding di correttezza

### F1 — Identità statica e runtime divergono

**Priorità: bloccante prima della stabilizzazione.**

A runtime ogni dichiarazione di Intent riceve un `Symbol` nuovo in
[`boundary.ts`](../src/boundary.ts). La verifica statica della Composition usa invece una
stringa costruita come `` `${boundaryId}.${name}` `` in [`compose.ts`](../src/compose.ts).

Questo crea due nozioni di identità:

- per TypeScript due Intent con la stessa coppia di stringhe sono uguali ai fini del grafo;
- per il resolver sono uguali solo se condividono lo stesso `Symbol`.

Scenari confermati:

1. due oggetti distinti `boundary("orders")`, ciascuno con `intent("find")`;
2. due dichiarazioni distinte `Orders.intent("find")` sulla stessa Boundary;
3. `boundary("a.b").intent("c")` e `boundary("a").intent("b.c")`;
4. Boundary o nomi allargati a `string` anziché mantenuti come literal.

Nel primo e nel secondo scenario TypeScript può dichiarare completo il grafo, mentre la prima
invocazione fallisce con `No provider registered`.

Lo stesso problema indebolisce due policy dichiarate:

- `Intent.provide.using` verifica la “stessa Boundary” tramite il solo `BoundaryId` stringa;
- `Adapter.adapt` verifica il target tramite lo stesso parametro stringa.

Due istanze Boundary con lo stesso ID sono quindi intercambiabili nei tipi ma non a runtime.

#### Direzione raccomandata

Va scelta una sola semantica.

Opzione A: la coppia `(boundaryId, intentName)` è l'identità canonica.

- Il runtime risolve con una chiave strutturata, non con un `Symbol` fresco.
- `compose` rifiuta dichiarazioni duplicate o contratti incompatibili per la stessa chiave.
- Le stringhe non vengono concatenate con un separatore ambiguo.

Opzione B: l'identità è davvero nominale.

- Boundary o Intent ricevono un token `unique symbol` fornito dal caller.
- Il token viene propagato nei generics.
- TypeScript e runtime confrontano lo stesso concetto.

La scelta dipende dalla semantica desiderata per reload, duplicazione dei moduli e dichiarazioni
separate. La soluzione attuale, metà label e metà token generativo, offre il peggio di entrambe.

### F2 — Ciclo concorrente in deadlock

**Priorità: alta.**

La detection basata su `seeing` funziona per una singola catena A -> B -> A. Non funziona se A
e B vengono materializzati contemporaneamente da due entry point:

```ts
await Promise.all([ctx.a(), ctx.b()]);
```

Ogni risoluzione possiede il proprio `seeing`. A trova B in `inflight`, B trova A in `inflight`
e le due Promise attendono reciprocamente senza risolvere né rigettare.

#### Direzione raccomandata

Il grafo è noto a `compose()`: la Composition dovrebbe compilare un execution plan e validare i
cicli prima di esporre il root. La detection runtime può rimanere come difesa, ma non deve essere
la prima linea.

Il diagnostico dovrebbe riportare l'intero percorso:

```text
Circular dependency: orders.a -> orders.b -> orders.a
```

### F3 — Race fra materializzazione e `ctx.dispose()`

**Priorità: alta.**

Durante la materializzazione viene controllato `contextDisposed`, poi viene eseguito
`await resolveDeps(...)`. Se il context viene chiuso durante quell'attesa, la factory può ancora:

- completare;
- registrare cleanup in un bucket già svuotato;
- inserire l'operation nella cache dopo che questa è stata pulita;
- completare con successo la chiamata iniziata prima del disposal.

Un secondo `dispose()` ritorna immediatamente, quindi i cleanup registrati tardi possono non
essere mai eseguiti.

#### Direzione raccomandata

Il context deve tracciare:

- stato `open | disposing | disposed`;
- materializzazioni attive;
- opzionalmente operazioni attive;
- una singola Promise di disposal condivisa da tutti i caller.

Quando inizia il disposal, nuove chiamate devono essere rifiutate. Le materializzazioni in corso
devono essere attese oppure cancellate e rollbackate con una semantica esplicita.

### F4 — `root.dispose()` non è terminale

**Priorità: alta.**

Il root non conserva alcuno stato di disposal. Dopo `await root.dispose()` è possibile:

- creare un nuovo Execution context;
- usare un context esistente;
- rimaterializzare Provider composition-lifetime;
- registrare nuovi disposer.

Se un cleanup del root lancia, `compositionOps.clear()` non viene raggiunto e una chiamata
successiva può riusare un'operation associata a una risorsa già chiusa.

Due chiamate concorrenti a `dispose()` non attendono necessariamente lo stesso lavoro: quella
che trova il bucket già svuotato può completare prima della prima.

#### Direzione raccomandata

Anche il root deve avere una state machine e una `disposePromise` condivisa. L'interfaccia deve
definire il rapporto di ownership con i context attivi:

- il root chiude tutti i context;
- il root attende che si chiudano;
- oppure il root rifiuta il disposal finché ne esistono.

La scelta va documentata come parte dell'interfaccia, perché l'ordine corretto non può essere
lasciato a un esempio nel README.

### F5 — Una Surface alias può sovrascrivere `dispose`

**Priorità: medio-alta.**

Il context viene creato con un metodo `dispose`, poi le Surface alias vengono assegnate sullo
stesso oggetto. Una Surface con alias `dispose` sostituisce quindi il controllo lifecycle:

```ts
compose({ surface: { dispose: SomeProvider } });
```

`ctx.dispose()` invoca l'Intent e non rilascia le risorse. Anche il tipo è ambiguo perché diventa
un'intersezione fra l'operation e `dispose(): Promise<void>`.

#### Direzione raccomandata

Soluzione minima: riservare `dispose` e validarlo a `compose()`.

Soluzione più pulita ma breaking:

```ts
ctx.surface.someOperation(...)
await ctx.dispose()
```

In entrambi i casi i record interni dovrebbero essere creati senza prototipo, oppure i nomi
speciali come `__proto__` devono essere respinti.

### F6 — La verifica statica del wiring è fragile

**Priorità: media.**

L'estrazione dei Provider dal wiring ricorre sulle tuple. Una tupla inline mantiene quindi la
precisione:

```ts
compose({ surface, wiring: [ProviderA, ProviderB] });
```

Un normale array estratto viene invece trattato come privo di Provider:

```ts
const wiring = [ProviderA, ProviderB];
compose({ surface, wiring }); // falso Missing provider
```

L'annotazione con il tipo pubblico `ComposeOptions` può produrre il problema opposto: allarga la
Surface e il wiring fino a perdere controlli e autocomplete precisi.

Un Provider union scelto dinamicamente può infine generare un falso positivo: il type system
considera registrati gli Intent di tutti i rami, mentre a runtime ne esiste uno solo.

#### Direzione raccomandata

Offrire helper con const generics:

```ts
const wiring = defineWiring(ProviderA, ProviderB);

const definition = defineComposition({
  surface,
  wiring,
});
```

Il tipo `ComposeOptions` non dovrebbe essere presentato come annotazione da applicare a una
configurazione concreta. Se resta pubblico, la documentazione deve spiegare che allarga i tipi.

Per i valori union va scelta una policy: rifiutarli, oppure verificare che ogni variante possibile
chiuda il grafo.

### F7 — Le chiavi `symbol` sono accettate dai tipi ma ignorate a runtime

**Priorità: media.**

I mapped type su `keyof` includono i symbol. L'implementazione usa `Object.keys` e
`Object.entries`, che invece li ignorano.

Conseguenze confermate:

- `.using({ [someSymbol]: Dep })` compila ma la factory non riceve quella dipendenza;
- una Surface con alias symbol è presente nel tipo del context ma non nell'oggetto runtime.

La soluzione più coerente con l'interfaccia corrente è restringere esplicitamente alias e chiavi
dependency a stringhe. Se i symbol devono essere supportati, l'implementazione deve usare
`Reflect.ownKeys` end-to-end.

### F8 — `using()` ripetuto sostituisce silenziosamente le dipendenze

**Priorità: media-bassa.**

Il builder continua a esporre `.using` dopo la prima chiamata, ma l'implementazione sostituisce
l'intera mappa:

```ts
SomeIntent.provide.using({ a: A }).using({ b: B }); // A scompare
```

Il builder dovrebbe rendere `using` one-shot oppure fare un merge tipizzato, rifiutando chiavi
duplicate.

## Correttezza semantica oltre i tipi

### Il contratto strutturale non descrive tutto il comportamento

`Input`, `Success` ed `Err` descrivono la calling convention, ma non esprimono:

- side effect;
- idempotenza;
- autorizzazione;
- livello di consistenza;
- ordinamento;
- retry safety;
- performance e limiti di carico;
- osservabilità;
- failure tecniche possibili.

Questo non è un difetto specifico di Forma: è un limite intrinseco della tipizzazione strutturale.
Diventa però rilevante quando il sistema usa l'equivalenza strutturale per riscrivere identità
semanticamente nominate, come avviene con Binding.

### Technical failure fuori da `Result`

La separazione fra expected failure nel `Result` e technical failure tramite throw è coerente e
utile. Va però completata con una tassonomia degli errori prodotti dal runtime Forma:

- composition invalida;
- context o root disposed;
- ciclo;
- materializzazione fallita;
- cleanup fallito;
- cancellazione.

Oggi questi casi usano `Error` generici e messaggi testuali. Errori strutturati con `code`, Intent,
origin e dependency path migliorerebbero diagnostica e integrazione.

## Ergonomia

### Punti forti

- La forma `intent(name).contract<Input, Success, Err>()` è un compromesso ragionevole con i
  limiti di inferenza parziale di TypeScript.
- Le dependency operation vengono inferite dai rispettivi Intent.
- La Surface viene inferita dai Provider e normalizzata a Promise.
- `surface` e `wiring` rendono immediatamente visibile cosa è pubblico e cosa è privato.
- `.provide` e `.adapt` rendono esplicito chi possiede la realizzazione.
- La Composition del demo rimane molto piccola.

### Factory sincrone

La factory deve restituire sincronicamente l'operation. L'operation può essere async, ma il setup
che la crea no. Questo punto viene approfondito nella sezione dedicata perché limita direttamente
l'uso con risorse reali.

### Scope contagion

Una dipendenza `.perContext()` obbliga ogni consumer che la cattura a essere `.perContext()`.
Nel demo il lifetime si propaga attraverso:

1. ConnectionProvider;
2. SelectOrderProvider;
3. FindOrder Adapter Provider;
4. GetOrderProvider.

La regola è corretta: promuovere implicitamente un consumer longevo nasconderebbe una decisione
importante. L'ergonomia è però cerimoniosa e il messaggio TypeScript può diventare molto esteso.

Non raccomanderei una promozione automatica del lifetime nella prima versione stabile. È meglio
che il lifetime resti una decisione locale e visibile. Si può invece migliorare:

- il diagnostico;
- la visualizzazione dell'arco invalido;
- un helper di composizione che mostri l'effective lifetime senza mutarlo.

### Context senza seed

`createExecutionContext()` non accetta dati. Diventa quindi difficile inizializzare Provider
per-context usando:

- tenant;
- identità autenticata;
- request id e trace;
- locale;
- transaction metadata;
- `AbortSignal` dell'host.

Le alternative attuali sono propagare questi valori in ogni input oppure leggerli da stato
globale/AsyncLocalStorage. Entrambe possono produrre coupling invisibile.

Un seed tipizzato è una naturale evoluzione:

```ts
const root = compose<RequestScope>({ ... });

const ctx = root.createExecutionContext({
  tenantId,
  principal,
  signal,
});
```

Il seed deve essere immutabile e disponibile alle factory per-context, non necessariamente a
ogni operation pubblica.

### Disposal manuale

Il quick start e il demo insegnano una sequenza lineare:

```ts
const ctx = root.createExecutionContext();
await ctx.someOperation();
await ctx.dispose();
```

Se l'operation o una verifica intermedia lancia, il disposal viene saltato. La forma corretta
richiede `try/finally`, ma ripeterla in ogni caller è esattamente il tipo di protocollo che un
modulo profondo dovrebbe nascondere.

Questo motiva `withExecutionContext` e `AsyncDisposable`, approfonditi più avanti.

### `Result<T, never>` conserva un ramo impossibile

`Result<T, never>` resta una union con un ramo `{ ok: false; error: never }`. Il consumer deve
quindi fare narrowing anche per operazioni dichiarate infallibili.

Nel demo `ConnectionIntent` ha `Err = never`, ma `SelectOrderProvider` contiene comunque un ramo
`if (!opened.ok)`.

Possibili direzioni:

- rendere `Result<T, never>` condizionale e collassarlo a `Ok<T>`;
- distinguere Provider di valori/risorse dalle operation;
- mantenere la forma uniforme e accettare il costo, ma documentarlo.

La prima soluzione migliora l'ergonomia ma introduce conditional type visibili nella Surface. La
terza mantiene la massima regolarità. È una decisione di filosofia dell'interfaccia, non un bug.

### Interfaccia pubblica ampia

L'entrypoint esporta molti tipi di implementazione: builder, dependency mapping, resolved deps,
context della factory e origin. `Provider.factory` è pubblico pur essendo documentato come hook
interno.

Questo aumenta:

- rumore in autocomplete;
- superficie semver;
- possibilità di costruire Provider manualmente aggirando invarianti.

Conviene separare i tipi necessari ai caller dai dettagli usati dall'implementazione o dal
tooling. Se l'ispezionabilità è un obiettivo, è preferibile un descrittore pubblico readonly
rispetto all'esposizione della factory eseguibile.

### Diagnostica

I messaggi runtime riportano spesso soltanto `boundary.name`. Il runtime possiede già origin,
alias e dipendenze e potrebbe mostrare:

- percorso completo;
- alias Surface coinvolto;
- origin dei Provider in conflitto;
- lifetime effettivi;
- suggerimento di wiring mancante.

I test `@ts-expect-error` provano che esista un errore TypeScript, ma non stabilizzano la qualità
del diagnostico. Fixture compiler dedicate o `tsd` permetterebbero di testare scenari reali senza
affidarsi soltanto ai commenti accanto alle directive.

## Approfondimento: factory asincrone

### Stato attuale

La factory ha essenzialmente questa forma:

```ts
type Factory<Deps, Input, Success, Err> = (
  ctx: WithContext<Deps>
) => IntentOperation<Input, Success, Err>;
```

Durante la materializzazione `compose` invoca la factory senza `await` e mette immediatamente il
risultato in cache.

È importante distinguere due momenti:

1. **materializzazione**: acquisizione delle dipendenze e creazione dell'operation;
2. **invocazione**: esecuzione dell'operation su un input.

Forma consente che il secondo momento sia asincrono, non il primo.

### Perché un'operation async non basta

Molte risorse reali vengono acquisite asincronicamente:

```ts
const client = await pool.connect();
const channel = await broker.createChannel();
const session = await authenticate();
const transaction = await database.begin();
```

Se la factory deve essere sincrona, il caller ha tre workaround.

#### Inizializzazione lazy dentro l'operation

```ts
.with(({ lifetime }) => {
  let clientPromise: Promise<Client> | undefined;

  return async function execute(input) {
    clientPromise ??= pool.connect();
    const client = await clientPromise;
    // ...
  };
})
```

Questo sposta nel Provider policy che Forma dovrebbe possedere:

- coalescing concorrente;
- retry dopo setup fallito;
- registrazione del disposer;
- race con il disposal;
- cleanup di setup parziali.

#### Risorsa aperta fuori dalla Composition

Il caller può creare la risorsa prima di `compose()` e catturarla nella factory. In questo modo il
root non la possiede più e il lifecycle torna nel composition root applicativo.

#### Acquisizione a ogni invocazione

L'operation può aprire e chiudere una risorsa per ogni chiamata. Questo cambia però il lifetime:
non è più una risorsa per Execution context e può essere molto più costoso.

### Estensione minima dell'interfaccia

La forma naturale è rendere awaitable il risultato della factory:

```ts
type Awaitable<T> = T | PromiseLike<T>;

type Factory<Deps, Input, Success, Err> = (
  ctx: WithContext<Deps>
) => Awaitable<IntentOperation<Input, Success, Err>>;
```

e in materializzazione:

```ts
const op = await provider.factory(deps, lifetime);
```

Questa estensione non complica la forma d'uso sincrona e aumenta molto la profondità del modulo:
il runtime può gestire una volta sola concorrenza, fallimento e cleanup per tutte le risorse.

### Semantica necessaria

Il semplice `await` non è sufficiente. Prima di introdurre factory async vanno fissate queste
regole.

#### Coalescing

Più caller che materializzano lo stesso Provider nello stesso lifetime devono condividere una
sola Promise di setup.

#### Fallimento e retry

Una materializzazione fallita non dovrebbe essere messa in cache. La chiamata successiva può
ritentare, a meno che il Provider dichiari esplicitamente una policy diversa.

#### Rollback locale

I disposer registrati durante un tentativo fallito non devono restare vivi fino alla chiusura
dell'intero context. Ogni materializzazione dovrebbe avere un bucket locale:

```text
create local lifetime
resolve deps
await factory
if success: commit cleanup al lifetime owner
if failure: run local cleanup immediately
```

Questo concentra la conoscenza del setup parziale nel runtime.

Se la factory fallisce e il rollback riesce, il caller osserva l'errore originale della factory.
Se falliscono entrambi, il risultato deve essere
`SuppressedError(rollbackError, factoryError)`; se falliscono più cleanup locali,
`rollbackError` è un `AggregateError`. Anche il setup parziale segue così la stessa regola: la
failure primaria resta riconoscibile, ma nessun errore di rilascio viene perso.

#### Chiusura della registrazione

`Lifetime.onDispose` dovrebbe essere utilizzabile soltanto durante la materializzazione. Dopo che
la factory ha restituito l'operation, il lifetime locale viene chiuso; una registrazione tardiva
deve fallire. Altrimenti l'operation può catturare `lifetime` e registrare cleanup dopo il
disposal.

#### Cancellazione

La factory dovrebbe ricevere un `AbortSignal` legato allo scope:

```ts
.with(async ({ lifetime }) => {
  const client = await pool.connect({ signal: lifetime.signal });
  lifetime.onDispose(() => client.release());
  return input => execute(client, input);
})
```

Il segnale consente una cancellazione cooperativa, non garantita. Se il driver non la supporta,
il runtime deve comunque attendere o rollbackare la materializzazione prima di dichiarare
completato il disposal.

#### Ownership della materializzazione

Lo scope proprietario dipende dal lifetime del Provider, non dal context che per primo ne causa
la materializzazione:

- cache, Promise inflight, signal e cleanup di un Provider composition-lifetime appartengono al
  root;
- cache, Promise inflight, signal e cleanup di un Provider per-context appartengono a quel
  context;
- il context che invoca un Provider composition-lifetime possiede soltanto il lease della propria
  call verso una materializzazione condivisa.

Di conseguenza, chiudere `ctxA` non deve abortire né invalidare una factory root-scoped che può
servire anche `ctxB`. Soltanto `root.dispose()` la cancella. Simmetricamente, una factory
per-context non può sopravvivere al proprio context. Un Provider composition-lifetime non deve
avere accesso al seed di esecuzione: catturarlo reintrodurrebbe una captive dependency per via
ambientale.

Questa distinzione richiede che cache e inflight root-scoped vivano realmente nella state machine
del root; non possono dipendere dalla closure o dal flag `disposed` del context che ha iniziato la
prima risoluzione.

#### Disposal concorrente

Quando uno scope entra in `disposing`:

1. chiude l'ingresso pubblico a nuove materializzazioni e invocazioni;
2. abortisce il suo signal;
3. drena le operation e le materializzazioni già accettate, rollbackando eventuali risultati
   prodotti troppo tardi;
4. esegue i cleanup in LIFO;
5. entra in `disposed` anche se uno o più cleanup falliscono;
6. propaga l'errore aggregato dopo aver completato lo stato interno.

### Effetto sulla potenza espressiva

Le factory async aprono scenari che oggi il demo simula soltanto:

- connessione dedicata per request o transaction;
- channel per messaggistica;
- lock o lease distribuiti;
- sessioni autenticate;
- risorse temporanee;
- setup remoto con cleanup deterministico.

È un'estensione ad alto leverage perché evita che ogni Adapter reinventi un runtime di
inizializzazione.

## Approfondimento: ownership dell'Execution context

### Il problema

L'interfaccia corrente espone soltanto la primitive manuale:

```ts
const ctx = root.createExecutionContext();
try {
  return await ctx.someOp();
} finally {
  await ctx.dispose();
}
```

La primitive è necessaria, ma non è un safe default. Il caller deve ricordare un protocollo di
ordering e deve combinare correttamente eventuali errori del body con errori di cleanup.

La durata di un Execution context può però essere posseduta in due modi realmente diversi.

#### Ownership lessicale

La fine della Promise coincide con la fine dello scope:

- CLI command;
- job;
- handler HTTP non streaming;
- message consumer;
- transaction callback;
- test.

#### Ownership dell'host

Apertura e chiusura avvengono in callback o fasi differenti:

- mount/unmount di un modulo o controller;
- WebSocket o subscription;
- sessione o actor;
- stream long-lived;
- plugin di un framework;
- oggetto che usa il context attraverso più metodi.

Una sola forma non esprime bene entrambi i casi.

### Design A — Solo protocollo standard `AsyncDisposable`

La soluzione con l'interfaccia più piccola mantiene la primitive esplicita e aggiunge il
protocollo standard:

```ts
type AsyncLifetime = {
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

type CompositionRoot<Surface> = AsyncLifetime & {
  createExecutionContext(): ExecutionContext<Surface>;
};
```

Uso lessicale:

```ts
await using root = compose({ surface, wiring });

{
  await using ctx = root.createExecutionContext();
  await ctx.someOp();
}
```

Uso host-managed:

```ts
const ctx = root.createExecutionContext();
host.onStop(() => ctx.dispose());
```

#### Vantaggi

- interfaccia Forma minima;
- semantica di error composition già definita dal linguaggio;
- lifetime lessicale visibile tramite il blocco;
- nessuna callback inversion.

#### Svantaggi

- richiede TypeScript con supporto a Explicit Resource Management e `ESNext.Disposable` nelle
  lib;
- è meno scopribile di un metodo nominato;
- molti codebase non usano ancora `await using`;
- il callback non può ricevere una Surface borrowed che nasconda il controllo di lifecycle.

Dato il requisito Node 24, il supporto runtime esiste. Il package dovrebbe comunque dichiarare
correttamente i tipi disposable per i consumer.

### Design B — Handle ricco con scope e resource acquisition

La soluzione più flessibile separa nettamente operations e ownership:

```ts
type ExecutionContext<Surface, Seed> = {
  readonly operations: ExecutionSurface<Surface>;
  readonly seed: Readonly<Seed>;
  readonly signal: AbortSignal;
  dispose(reason?: unknown): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

type CompositionRoot<Surface, Seed = void> = {
  openExecutionContext(options: ExecutionContextOptions<Seed>): ExecutionContext<Surface, Seed>;
  withExecutionContext<T>(
    callback: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
    options: ExecutionContextOptions<Seed>
  ): Promise<Awaited<T>>;
  dispose(reason?: unknown): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};
```

Il `Lifetime` può inoltre offrire acquisizione atomica di risorse:

```ts
type Lifetime = {
  readonly signal: AbortSignal;
  onDispose(cleanup: Disposable): void;
  acquire<T>(
    acquire: (signal: AbortSignal) => Awaitable<T>,
    release: (resource: T) => Awaitable<void>
  ): Promise<T>;
  use<T extends AsyncDisposable>(resource: T | PromiseLike<T>): Promise<T>;
};
```

`acquire` elimina la finestra fra acquisizione completata e registrazione manuale del cleanup.

#### Vantaggi

- supporta seed, cancellazione e resource acquisition in modo coerente;
- separa definitivamente Surface e lifecycle controls;
- è adatto a host e framework diversi;
- permette tooling e diagnostica ricchi.

#### Svantaggi

- è un salto di complessità notevole per un alpha;
- introduce molte decisioni prima che esistano use case reali;
- `Lifetime.acquire` e definizioni di context possono diventare un secondo framework dentro
  Forma;
- aumenta la superficie semver.

### Design C — Safe default additivo più primitive esplicita

Il compromesso orientato al caller comune mantiene una sola implementazione di lifecycle, ma
offre due ingressi che rappresentano ownership differenti:

```ts
type Awaitable<T> = T | PromiseLike<T>;

type ExecutionContext<Surface, Seed> = {
  readonly surface: ExecutionSurface<Surface>;
  readonly signal: AbortSignal;
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

type CompositionRoot<Surface, Seed = void> = {
  openExecutionContext(...options: ExecutionContextArgs<Seed>): ExecutionContext<Surface, Seed>;

  withExecutionContext<T>(
    run: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
    ...options: ExecutionContextArgs<Seed>
  ): Promise<Awaited<T>>;

  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};
```

`openExecutionContext` comunica meglio di `createExecutionContext` il trasferimento di ownership.
Durante una migrazione l'attuale nome può rimanere come alias deprecato.

Uso semplice:

```ts
const result = await root.withExecutionContext(async (ctx) => {
  return ctx.someOp(input);
});
```

Uso integrato in un lifecycle esterno:

```ts
class SomeModule {
  readonly #execution = root.openExecutionContext({ seed });
  readonly operations = this.#execution.surface;

  onDestroy(): Promise<void> {
    return this.#execution.dispose();
  }
}
```

Uso lessicale senza callback:

```ts
await using execution = root.openExecutionContext({ seed });
await execution.surface.someOp(input);
```

### Confronto

| Design                   | Depth      | Locality | Ergonomia semplice                | Lifecycle host-managed | Costo interfaccia |
| ------------------------ | ---------- | -------- | --------------------------------- | ---------------------- | ----------------- |
| A — solo AsyncDisposable | Alta       | Alta     | Buona se `await using` è adottato | Ottima                 | Minimo            |
| B — handle ricco         | Molto alta | Alta     | Buona                             | Ottima                 | Alto              |
| C — ibrido               | Alta       | Alta     | Ottima                            | Ottima                 | Moderato          |

### Raccomandazione

Raccomandazione: **Design C**, introdotto incrementalmente.

1. La primitive universale resta un handle esplicitamente owned.
2. `withExecutionContext` diventa il safe default documentato per scope brevi.
3. `[Symbol.asyncDispose]` supporta scope lessicali senza callback.
4. Tutti i percorsi delegano alla stessa state machine; non devono esistere semantiche di
   disposal differenti.
5. Seed tipizzato e `AbortSignal` possono essere aggiunti insieme alle factory async.
6. `Lifetime.acquire` va rimandato finché due o più integrazioni reali non ne dimostrano il
   bisogno.

`withExecutionContext` supera il deletion test: eliminandolo, `try/finally`, combinazione degli
errori e disciplina di cleanup ricompaiono in ogni handler che non usa `await using`. Rimane
comunque una convenience sopra la primitive, non un secondo lifecycle.

### Semantica precisa di `withExecutionContext`

```ts
await root.withExecutionContext(async (surface) => {
  await surface.someOp();
});
```

Deve:

1. aprire un context;
2. invocare il callback una volta;
3. attendere completamente il valore restituito;
4. iniziare il disposal anche su throw, rejection o early return;
5. attendere il disposal prima di completare;
6. non esporre il lifecycle handle al callback, soltanto una Surface borrowed.

Matrice degli errori:

| Callback   | Cleanup    | Risultato                                      |
| ---------- | ---------- | ---------------------------------------------- |
| successo   | successo   | valore del callback                            |
| fallimento | successo   | stesso errore del callback                     |
| successo   | fallimento | errore di cleanup                              |
| fallimento | fallimento | `SuppressedError(cleanupError, callbackError)` |

Se più cleanup falliscono, `cleanupError` è un `AggregateError`. Questa semantica coincide con
`await using` applicato a un singolo execution handle, il cui `[Symbol.asyncDispose]` aggrega
internamente i cleanup, e non perde nessuno dei due errori. Più risorse `await using` dichiarate
separatamente producono invece normalmente `SuppressedError` annidati.

Una semplice implementazione `finally { await ctx.dispose() }` senza error composition esplicita
non basta, perché il cleanup error può nascondere il body error in modo non documentato.

### Perché la callback può essere peggiore per un lifecycle di componente

La callback è corretta soltanto quando la Promise restituita rappresenta tutta la durata dello
scope.

Per un modulo, controller, WebSocket o UI lifecycle, mount e unmount avvengono in momenti diversi.
Forzare `withExecutionContext` porta a due anti-pattern:

- il callback ritorna dopo il setup e il context viene chiuso troppo presto;
- il callback tiene artificialmente pendente una Promise fino all'evento di teardown.

In questi casi l'host deve possedere l'handle:

```ts
const execution = root.openExecutionContext({ seed });

host.provide("some-operations", execution.surface);
host.onStop(() => execution.dispose());
```

L'integrazione host-specifica è un modulo sottile sopra il seam di lifecycle. Non va incorporata
nel core finché non esistono almeno due host che giustifichino un'interfaccia comune.

Se l'hook di teardown dell'host non può attendere una Promise, Forma non può garantire che il
caller osservi gli errori di cleanup. L'integrazione deve inoltrarli al meccanismo di error
reporting dell'host.

### Escape e fire-and-forget

Il type system non può impedire completamente che una operation o un valore context-bound esca
dal callback. Dopo il return, nuove invocazioni devono fallire perché il context è disposed.

Allo stesso modo:

```ts
await root.withExecutionContext(async (ctx) => {
  void ctx.longRunningOp();
});
```

è intrinsecamente ambiguo. Il callback ha dichiarato concluso il lavoro mentre un'operation usa
ancora le risorse.

Il runtime dovrebbe tracciare le surface call attive e attendere quelle iniziate prima del
disposal. Una call ancora attiva quando il callback termina è, dal punto di vista del lifecycle,
lavoro detached: se rigetta durante il draining, la sua failure diventa un `drainError`.

Più failure di draining formano un `AggregateError`. Draining e cleanup costituiscono insieme la
failure di lifecycle; se fallisce anche il callback, questa viene composta come
`SuppressedError(lifecycleError, callbackError)`. Una call non attesa che si è già assestata prima
del termine del callback non è invece distinguibile in modo affidabile da una failure che il
callback ha osservato e gestito: il contratto deve quindi vietare il fire-and-forget e il runtime
può al massimo segnalarlo tramite diagnostica.

Questa attesa è una protezione contro use-after-dispose, non una promessa che il fire-and-forget
sia supportato. Un'operation detached che non termina può bloccare la chiusura.

### Draining e chiamate alle dependency

Quando il context entra in `disposing` deve rifiutare nuove Surface call. Non può però rifiutare
indiscriminatamente ogni dependency invocation:

- una Surface call già iniziata può fare `await` e usare una dipendenza in seguito;
- un disposer di un Provider può dover usare una sua dipendenza prima che questa venga chiusa.

Il runtime deve distinguere quattro fasi:

1. all'ingresso in `disposing`, la Surface esterna viene chiusa a nuovo lavoro;
2. le call già accettate mantengono un lease causale e possono completare il loro grafo, incluse
   materializzazioni lazy necessarie a quella call;
3. terminato il draining, non sono ammesse nuove materializzazioni; durante il cleanup, ciascun
   disposer mantiene però un lease interno sulle sole dependency già materializzate, dichiarate
   dal grafo e non ancora chiuse;
4. terminati i cleanup, ogni invocation viene rifiutata e lo scope è terminalmente `disposed`.

In questo modo un disposer può ancora usare una dipendenza viva senza riaprire il grafo o
accettare nuovo lavoro esterno.

Il LIFO derivato dal dependency graph consente al consumer di chiudersi prima della dipendenza.
Il lavoro detached fuori dal lease non è supportato.

### `root.dispose()` come backstop

Il root deve tracciare i context aperti. Il suo disposal raccomandato è:

1. transizione sincrona a `disposing`;
2. blocco di nuovi context;
3. abort dei signal dei context;
4. disposal di tutti i context ancora aperti;
5. attesa del loro draining e dei cleanup;
6. disposal delle risorse composition-lifetime;
7. aggregazione finale degli errori;
8. stato terminale `disposed` anche in caso di failure.

In questo modo il root è anche un backstop per un context dimenticato. L'host dovrebbe comunque
fermare l'ingresso di nuovo lavoro prima dello shutdown del root.

## Approfondimento: Binding o Adapter passthrough

### Cosa fa Binding

`bind(required, satisfier)` non crea una Realization. Registra una riscrittura:

```text
required Intent identity -> satisfier Intent identity
```

Il resolver materializza direttamente il Provider del satisfier. Non esiste quindi:

- una factory del required Intent;
- un'operation wrapper;
- un origin dedicato;
- un punto in cui aggiungere mapping o policy;
- un nuovo lifetime da dichiarare.

Il type system accetta Binding soltanto quando Input, Success ed Err sono mutuamente assegnabili.
Questo prova compatibilità strutturale, non equivalenza semantica.

### Perché è pericoloso

Intent introduce identità proprio per distinguere operazioni che possono avere la stessa shape.
Binding può cancellare quella distinzione.

Due Intent strutturalmente uguali possono differire per:

- significato del risultato;
- autorizzazione applicata;
- consistenza dei dati;
- idempotenza;
- side effect;
- retry safety;
- latenza o rate limit;
- errori tecnici;
- osservabilità richiesta.

Esempio: `users.find` e `cache.get` possono condividere i medesimi tipi senza essere sostituibili.

Binding ha inoltre un effetto globale nella Composition: ogni consumer del required Intent viene
riscritto verso il satisfier. Il punto di sostituzione è visibile nel wiring, ma non esiste un
modulo che incarni e documenti quella decisione.

### Adapter passthrough

Un Adapter passthrough realizza esplicitamente il required Intent tramite il satisfier:

```ts
const OrdersPostgres = adapter("orders-postgres", Orders);

const FindOrderViaPostgres = OrdersPostgres.adapt(FindOrder)
  .perContext()
  .using({ select: SelectOrder })
  .with(
    ({ deps: { select } }) =>
      function findOrder(input) {
        return select(input);
      }
  );
```

Anche senza mapping, questa forma conserva informazioni importanti:

- `FindOrder` mantiene la propria identità runtime;
- il graph plan mostra un arco `FindOrder -> SelectOrder`;
- l'origine dell'integrazione è esplicita;
- lifetime e captive dependency vengono verificati sul Provider passthrough;
- tracing e diagnostica possono mostrare entrambi gli Intent;
- in futuro si possono aggiungere policy senza cambiare i consumer.

Il costo è:

- più boilerplate;
- una operation wrapper;
- propagazione esplicita del lifetime;
- un passaggio runtime in più.

Per operazioni I/O-bound il costo runtime è trascurabile rispetto al guadagno semantico.

### Quando Binding è giustificato

Binding è ragionevole soltanto quando i due Intent sono deliberatamente sinonimi, non soltanto
compatibili.

Esempi possibili:

- rinomina durante una migrazione;
- alias temporaneo fra vecchia e nuova identità;
- due entry point che il dominio dichiara formalmente equivalenti;
- compatibilità fra versioni senza mapping né policy.

Anche in questi casi servono restrizioni:

- nessuna catena di Binding implicita;
- nessun ciclo;
- reason/provenance ispezionabile;
- diagnostica che mostri required e satisfier;
- documentazione dell'obbligo semantico, non solo strutturale.

Una forma più onesta potrebbe essere:

```ts
aliasIntent(OldFindOrder, FindOrder, {
  reason: "temporary rename during orders-v2 migration",
});
```

Il nome `bind` è generico e può essere interpretato come normale dependency binding. `aliasIntent`
o `unsafeAliasIntent` comunica meglio che non sta creando una Realization.

### Raccomandazione

Raccomandazione netta:

- **cross-boundary**: usare un Adapter passthrough anche quando le shape coincidono;
- **same-boundary**: usare un Provider passthrough, salvo vero alias di migrazione;
- **Binding**: tenerlo soltanto come escape hatch raro e rinominarlo come alias;
- se prima della v1 non emerge un caso concreto non sostituibile da un passthrough, rimuoverlo
  dall'interfaccia stabile.

Non introdurrei subito un helper `forward`. Se il boilerplate passthrough compare ripetutamente in
casi reali, un futuro:

```ts
OrdersPostgres.forward(FindOrder).to(SelectOrder);
```

dovrebbe generare un vero Provider con un dependency edge, non una identity rewrite mascherata.

## Review di `forma-demo`

### Cosa dimostra bene

- separazione tra Orders e Postgres;
- contratti con shape differenti;
- Adapter che traduce input, output ed errori;
- Surface minima;
- wiring privato;
- catena interamente per-context;
- cleanup della connessione simulata.

### Modulo shallow

`GetOrderProvider` delega soltanto a `FindOrder`. La Surface può già rinominare un Provider come
`getOrder`, quindi eliminare quel pass-through non fa ricomparire complessità altrove.

Il demo rischia così di presentare Forma come cerimonia anziché come leverage.

Possibili miglioramenti:

- autorizzazione prima della lettura;
- cache con fallback;
- arricchimento da più Boundary;
- mapping di più categorie di errore;
- policy applicativa reale;
- metriche o tracing.

### Postgres simulato

La “connessione” viene costruita sincronicamente sopra una `Map`. È utile per spiegare il grafo,
ma non esercita:

- acquisizione async;
- fallimento durante il setup;
- transaction scope;
- cancellazione;
- race fra setup e disposal.

Dopo il supporto alle factory async, il demo dovrebbe usare almeno una risorsa fake acquisita con
Promise e un test controllato di cleanup.

### Un solo Adapter

Il seam diventa concretamente giustificato quando esistono almeno due Adapter. Una seconda
Composition in-memory o test mostrerebbe il payoff:

```text
Orders Intent <- Postgres Adapter
              <- In-memory Adapter
```

### Disposal non exception-safe

Il demo chiude context e root soltanto sul percorso felice. Dovrebbe insegnare il safe path:

```ts
await using root = compose(...);

await root.withExecutionContext(async (ctx) => {
  await ctx.getOrder(...);
});
```

oppure mostrare esplicitamente il `try/finally` per il percorso host-managed.

### Nomenclatura

Nel demo `OrdersAdapter` è un Adapter Forma, mentre `FindOrderAdapter` è un Provider. Un nome più
preciso sarebbe `OrdersPostgres` per il primo e `FindOrderViaPostgresProvider` per il secondo.

## Potenza espressiva

### Scenari aperti bene

#### Modular monolith

Ogni Composition può esporre una façade stretta e mantenere privato il proprio grafo. Questo
riduce il coupling fra caller e implementazione.

#### Varianti production/test

Provider e Adapter diversi possono realizzare gli stessi Intent senza cambiare i consumer. Una
Composition in-memory diventa un test double dell'intero modulo, non una collezione di mock
interni.

#### Anti-corruption layer

Adapter può concentrare mapping fra contratti di dominio e vendor/infrastruttura, inclusi errori
e orchestrazione di più dipendenze.

#### Request e unit-of-work scope

Con lifecycle corretto, seed e factory async, un Execution context può rappresentare request,
transaction, message handling o unit of work.

#### Migrazioni progressive

Nuovi Adapter possono convivere con Provider esistenti in Composition differenti. Gli alias di
migrazione possono aiutare, se semanticamente espliciti.

#### Tooling architetturale

Provider ispezionabili aprono a:

- graph visualization;
- architecture tests;
- diagnostica dei lifetime;
- inventory degli Adapter;
- documentazione generata;
- readiness plan;
- analisi di dipendenze non usate.

Un `describePlan()` readonly sarebbe una naturale interfaccia futura.

### Scenari oggi chiusi o innaturali

- async resource acquisition;
- context seed e cancellation;
- plugin runtime e multibinding;
- Provider condizionali per singola request;
- routing per tenant;
- streaming e subscription long-lived;
- scope gerarchici;
- composition fragments modulari senza perdita di tipi;
- workflow cross-boundary senza un target naturale;
- hot swap di Provider;
- eager initialization e health checking.

Non tutti devono entrare in Forma. L'obiettivo non dovrebbe essere diventare un container
universale. Le estensioni vanno aggiunte soltanto quando mantengono una Surface piccola e
concentrano complessità realmente ripetuta.

## Rischi di design e anti-pattern

### Intent explosion

Non ogni helper, valore o loader deve diventare un Intent. L'identità è utile quando sostituzione,
binding o graph inspection hanno valore reale.

### God Adapter

Un Adapter può `using` Intent di qualunque Boundary. Senza disciplina può diventare il luogo in
cui finisce ogni orchestration cross-boundary.

Adapter dovrebbe realizzare Intent del proprio target e contenere integrazione o policy
coerente, non diventare un application layer universale.

### Architecture theatre

Il grafo dichiarato può apparire pulito mentre la factory cattura dipendenze tramite import o
global. Lint dell'import graph e review architetturale restano necessari.

### Wrapper shallow

Creare nuovi Intent e Provider soltanto per rinominare un'operation aumenta la superficie da
imparare senza aggiungere leverage.

### Semantic laundering tramite Binding

Una identity rewrite può far sembrare formalmente valido ciò che è soltanto strutturalmente
compatibile.

## Strategia di test raccomandata

La Surface deve restare la principale test surface. I test interni servono per il runtime di
Forma, non per obbligare i consumer a conoscere la sua implementazione.

### Test mancanti ad alta priorità

#### Identità

- due Boundary distinte con lo stesso ID;
- due dichiarazioni dello stesso nome sulla stessa Boundary;
- collisioni causate da punti nei nomi;
- ID o nomi allargati a `string`;
- Adapter target con Boundary omonime.

#### Grafo

- ciclo singolo rilevato a `compose`;
- ciclo concorrente da due Surface alias;
- Binding cycle e Binding chain;
- Provider union;
- wiring estratto come array;
- configurazione annotata come `ComposeOptions`.

#### Lifecycle

- uso dopo `root.dispose()`;
- apertura di un context dopo root disposal;
- due disposal concorrenti che attendono la stessa Promise;
- disposer root che fallisce;
- context attivi durante root shutdown;
- disposal durante factory o dependency materialization;
- operation inflight durante disposal;
- cleanup registrato tardi;
- Surface alias `dispose` e nomi speciali.

#### Factory async

- coalescing della prima materializzazione;
- factory rejection non cached;
- retry successivo;
- rollback dei cleanup parziali;
- factory e rollback entrambi falliti;
- disposal durante acquisition;
- registrazione su Lifetime sigillato.

#### `withExecutionContext`

- matrice callback/cleanup success/failure;
- early return;
- callback sincrono;
- callback async;
- context sempre deregistrato dal root;
- disposal root con callback attivo;
- operation escaped dopo la callback;
- fire-and-forget e draining.

### Test di diagnostica

Affiancare ai test runtime fixture compiler che asseriscano diagnostici significativi. I commenti
accanto a `@ts-expect-error` non verificano che il messaggio sia davvero leggibile.

## Packaging e documentazione

Il README pubblicato linka `GLOSSARY.md` e `docs/adr`, ma `package.json` includeva soltanto:

- `dist`;
- `README.md`;
- `LICENSE`.

Il pacchetto deve includere anche:

- `GLOSSARY.md`;
- `docs`.

In questo modo ADR e questa review restano disponibili sia nell'installazione npm sia
nell'eventuale rendering del package.

Altri drift documentali osservati:

- il README indica ancora `0.0.0`, mentre il package è `0.1.0-alpha.0`;
- il quick start usa `Conn`, `SelectOrder` e `openConnection` senza definirli;
- il README root del monorepo descrive Forma come “Form modeling utilities”, mentre è una
  libreria di composition.

## Roadmap raccomandata

### P0 — Coerenza e lifecycle

1. Unificare l'identità statica e runtime.
2. Compilare e validare il graph plan a `compose()`.
3. Introdurre state machine terminali per root e context.
4. Correggere deadlock concorrenti e race con il disposal.
5. Riservare i nomi lifecycle e restringere correttamente le chiavi a stringa.

### P1 — Safe path e risorse reali

1. Supportare factory asincrone con rollback locale.
2. Aggiungere `AsyncDisposable` a root e context.
3. Aggiungere `withExecutionContext` come safe default additivo.
4. Tracciare context e surface call attive.
5. Introdurre seed tipizzato e `AbortSignal`.
6. Offrire `defineWiring` o `defineComposition` per preservare i tipi.

### P2 — Chiarezza semantica

1. Rendere Adapter passthrough il default cross-boundary.
2. Rinominare e restringere Binding come alias eccezionale.
3. Migliorare errori e diagnostica con metadata strutturati.
4. Ridurre i tipi di implementazione esportati.
5. Rendere il demo non shallow e aggiungere un secondo Adapter.

### P3 — Tooling, solo dopo il consolidamento

1. `describePlan()` readonly;
2. graph visualization;
3. architecture tests;
4. health/readiness plan;
5. composition fragments, soltanto se richiesti da casi reali;
6. valutazione di multibinding e conditional Provider.

## Conclusione

Forma è più interessante di un container generico perché prova a rendere esplicite tre cose che
spesso rimangono disperse:

- identità dell'intenzione;
- grafo delle realizzazioni;
- ownership del lifecycle.

La Surface esplicita e l'assenza di un resolver pubblico sono decisioni da preservare. Il
potenziale di leverage è reale: una Composition corretta può diventare un seam applicativo
piccolo, testabile e ispezionabile.

La priorità non è però aggiungere altre primitive architetturali. Prima vanno rese vere le
promesse già presenti: identità coerente, closed graph, disposal terminale e concorrenza sicura.

Con questi fondamentali, factory async e un safe execution-context lifecycle aprono scenari
realistici senza allargare eccessivamente l'interfaccia. Binding va invece ridimensionato: quando
una sostituzione rappresenta una realizzazione, anche passthrough, un Provider esplicito conserva
più semantica e locality di una riscrittura d'identità.
