# Forma: piano operativo per documentazione tecnica e blog post

> Stato: bozza operativa da discutere e seguire progressivamente.
>
> Questo documento pianifica il lavoro. Non contiene ancora la documentazione pubblica né il
> blog post definitivo.

## Avanzamento

- **Troncone A:** prima stesura completa sul branch `feature/forma-documentation`; build, typecheck,
  test Forma e controllo visuale eseguiti. In attesa di review.
- **Troncone B:** shared understanding raggiunta; prima bozza testuale scritta. Le quattro visuali
  selezionate (`AI feedback loop`, anatomia della Composition, Adapter semantico e scoperta
  progressiva di un Boundary) sono state generate e integrate; la review finale non è ancora stata
  eseguita.

## Obiettivo

Produrre due deliverable distinti ma coerenti:

1. una sezione di documentazione tecnica di `@xndrjs/forma` dentro
   `@xndrjs/documentation`;
2. un blog post che ricostruisca il problema da cui Forma è nato, faccia emergere il suo modello
   concettuale e mostri le conseguenze architetturali del modello.

La documentazione deve permettere di usare correttamente la libreria. Il blog deve permettere di
capire perché esiste e quale diverso modo di pensare rende possibile. Non devono essere due versioni
con diversa lunghezza dello stesso testo.

## Decisioni già condivise

- Forma nasce per rendere più esplicite, navigabili e verificabili le relazioni architetturali,
  anche come risposta al drift amplificato dall'agentic coding.
- La proprietà desiderata è la **semantic change locality**: un cambiamento concettuale deve avere
  un impatto comprensibile, prevedibile e proporzionato.
- Forma non sostituisce Clean Architecture, DDD o l'organizzazione fisica del repository. Offre
  primitive per esprimere e verificare alcune delle loro relazioni.
- Il blog non conterrà una chiusura del tipo "quando Forma è eccessiva per applicazioni semplici".
  La struttura può essere adottata fin dall'inizio senza introdurre preventivamente layer vuoti;
  saranno invece documentati con precisione stato alpha, non-goal e limiti effettivi.
- Gli schemi del blog saranno discussi e approvati uno alla volta prima di produrre gli asset
  definitivi.
- Non useremo il blog per annunciare feature non implementate. Eventuali scenari futuri saranno
  dichiarati come conseguenze o direzioni, non come garanzie correnti.

## Fonti e ordine di autorità

Prima della scrittura va ricostruito un content lock a partire da queste fonti, in quest'ordine:

1. API pubblica, implementazione e test correnti in `packages/forma`;
2. `packages/forma/GLOSSARY.md` e gli ADR accettati;
3. `packages/forma/README.md` per la forma pubblica dell'API;
4. `apps/forma-demo`, con Orders per le meccaniche runtime ed Editorial per l'evoluzione
   architetturale;
5. cronologia Git e analisi iniziale per raccontare l'origine del progetto.

I documenti esplorativi e le review storiche non sono fonti normative: possono spiegare come si è
arrivati a una decisione, ma non devono reintrodurre semantiche superate.

Il vocabolario da mantenere uniforme è quello del Glossario corrente: Boundary, Intent, Contract,
Modality, Provider, Adapter, Intent alias, Composition, Entry Boundary, Surface, Execution context,
InvocationOutcome, Expected Error e Unexpected Failure.

---

## Troncone A — Documentazione tecnica

### A1. Definire la collocazione nella information architecture

Proposta: introdurre nel sito una sezione di primo livello **Application Architecture**, distinta da
Modeling e Resource Orchestration.

Percorso proposto:

```text
src/content/docs/v0/application-architecture/forma/
├── index.md
├── mental-model.md
├── first-composition.md
├── providers-and-dependencies.md
├── adapters-and-evolution.md
├── composition-and-execution.md
├── errors-and-outcomes.md
├── streaming.md
└── inspection-and-testing.md
```

La struttura è intenzionalmente compatta. Una pagina deve avere un problema e un compito distinti;
non va creata una pagina per ogni simbolo esportato.

Attività:

1. verificare il nome definitivo della categoria e gli slug;
2. aggiornare la sidebar di Starlight;
3. aggiungere Forma alla Introduction, alla mappa del toolkit e alla pagina v0 dove opportuno;
4. verificare i redirect `/latest` generati dall'infrastruttura attuale;
5. decidere se il README del package deve rimandare alla nuova guida pubblica oltre che ai propri
   ADR.

**Checkpoint A1:** approvare albero delle pagine, label della sidebar e ordine di lettura prima di
scrivere i testi.

### A2. Scrivere l'overview

File: `forma/index.md`.

Contenuti:

- problema affrontato e promessa della libreria;
- cosa significa "intent-oriented composition";
- relazione con Clean Architecture senza usare i suoi termini come sinonimi;
- installazione e compatibilità runtime;
- esempio minimo completo: Boundary, Intent, Provider, Composition ed esecuzione;
- mappa delle pagine successive;
- stato alpha espresso senza sminuire le garanzie già implementate.

L'overview deve portare a una prima invocazione funzionante, ma non deve anticipare Adapter,
streaming e lifecycle avanzato.

**Checkpoint A2:** un lettore deve poter spiegare la differenza tra Intent e Provider dopo una sola
pagina.

### A3. Fissare il mental model

File: `forma/mental-model.md`.

Ordine concettuale:

1. un Boundary possiede un linguaggio e i suoi Contract;
2. un Intent identifica cosa si vuole ottenere, non come;
3. un Provider realizza l'Intent e dichiara dipendenze e lifetime;
4. un Adapter realizza dall'esterno un Intent di un Boundary target;
5. una Composition chiude il grafo e sceglie cosa pubblicare;
6. un Entry Boundary stabilisce da dove può iniziare la traversata pubblica;
7. un Execution context possiede l'esecuzione e le risorse contestuali.

Includere esplicitamente:

- l'identità strutturata `(boundaryId, intentName)`;
- la differenza fra identità semantica e compatibilità strutturale del Contract;
- il fatto che Boundary non significhi necessariamente bounded context, package o directory;
- il criterio di ammissione degli Intent: non ogni funzione o helper deve diventarlo;
- unary e stream come modalità dello stesso concetto.

**Checkpoint A3:** confrontare ogni definizione con il Glossario e rimuovere sinonimi ambigui.

### A4. Guidare alla prima Composition reale

File: `forma/first-composition.md`.

Costruire progressivamente un esempio piccolo ma credibile:

1. dichiarare `Orders` e un Intent;
2. dichiararne il Contract;
3. realizzarlo con un Provider;
4. pubblicarlo nella Surface;
5. aprire un Execution context con `withExecutionContext`;
6. leggere un `InvocationOutcome`;
7. mostrare il dispose automatico del contesto e quello esplicito del root.

Spiegare solo la sintassi necessaria, incluse la forma `ctx => function` e la presenza di `ctx.out`.
Usare `code` per il discriminante degli Expected Error e riservare `kind` a
`InvocationOutcome`.

**Checkpoint A4:** il codice deve essere verificato contro l'API pubblica corrente, non ricostruito
a memoria.

### A5. Documentare Provider, dipendenze e lifetime

File: `forma/providers-and-dependencies.md`.

Contenuti:

- `using` come unica dichiarazione delle dipendenze Intent;
- dipendenze same-Boundary nei Provider ordinari;
- assenza di resolver pubblico e conseguenze sulla leggibilità del grafo;
- materializzazione lazy e coalescing degli accessi concorrenti;
- policy `auto`, `.perContext()` e `.perComposition()`;
- inferenza transitiva del lifetime effettivo e captive-dependency prevention;
- Params tipizzati e plain outer bag shallow-readonly;
- factory asincrone, commit/rollback del Lifetime e `onDispose`;
- cosa viene materializzato quando si invoca un nodo della Surface.

Usare Orders/SQLite per mostrare una risorsa reale e il suo ownership model, chiarendo che
`DatabaseSync` è un trade-off della demo e non un limite espressivo di Forma.

**Checkpoint A5:** distinguere sempre dichiarazione del Provider, lifetime effettivo e lifetime
della singola invocazione stream.

### A6. Documentare Adapter, Intent alias ed evoluzione dei Boundary

File: `forma/adapters-and-evolution.md`.

Contenuti:

- Adapter come identità peer del Boundary e scoped a un Boundary target;
- Adapter Provider come wiring privato, mai come Surface root;
- traduzione di input, success ed Expected Error;
- pass-through invariato di Unexpected Failure e Cancellation;
- Adapter passthrough come default anche a parità di shape;
- Intent alias come sinonimo intenzionale, rename o migrazione temporanea;
- distinzione fra spostare una responsabilità/realizzazione e riutilizzare letteralmente lo stesso
  Provider;
- caso Editorial completo: Sitemap, PageBuilder, Routing e CmsSnapshot;
- scoperta progressiva dei Boundary e migrazione senza big bang.

**Checkpoint A6:** lo schema finale deve rendere visibili ownership, direzione e semantica dei due
collegamenti diversi: alias per Sitemap, Adapter per PageBuilder.

### A7. Documentare Composition ed Execution

File: `forma/composition-and-execution.md`.

Contenuti:

- `entryBoundaries`, `surface` e `wiring`;
- grafo chiuso, completezza, cicli e realizzazioni concorrenti;
- perché la Surface non è un catalogo di tutti i Provider registrati;
- perché un Adapter non è un entry point valido;
- forma inline raccomandata e ruolo di `defineWiring` / `defineComposition` quando si estrae la
  configurazione;
- `openExecutionContext`, `withExecutionContext` e `await using`;
- Params, host signal, abort vs dispose;
- root dispose come backstop;
- `describePlan()` come rappresentazione leggibile del grafo compilato.

**Checkpoint A7:** includere almeno un diagramma della direzione Surface → Entry Boundary → wiring
privato.

### A8. Documentare il protocollo degli errori

File: `forma/errors-and-outcomes.md`.

Contenuti:

- `InvocationOutcome` e i quattro branch;
- Expected Error come unico errore semanticamente interpretabile dal chiamante;
- totalizzazione di throw/rejection al Boundary di origine;
- opacità di Unexpected Failure e lifecycle del `failureId`;
- uso di `out.unexpectedFailure()` e del reporter asincrono;
- differenza tra reporting locale e `compose({ onUnexpectedFailure })` per conversioni
  automatiche;
- responsabilità degli Adapter nella propagazione;
- errori di lifecycle esclusi dal Contract e ancora eccezionali;
- comportamento equivalente per unary e stream.

**Checkpoint A8:** nessun esempio deve suggerire che un Boundary chiamante possa interpretare una
cause sconosciuta proveniente da un altro Boundary.

### A9. Documentare gli Stream Intent

File: `forma/streaming.md`.

Contenuti:

- dichiarazione con `boundary.stream`;
- stream cold e single-consumer;
- differenza tra Provider lifetime e stream invocation ownership;
- prima `next()`, materializzazione e startup transazionale;
- terminal outcome vs completamento naturale;
- `break`, `return()`, `AsyncDisposable`, context dispose e root dispose;
- signal per invocazione e cancellazione cooperativa;
- cleanup deterministico e aggregazione degli errori di chiusura;
- Adapter e alias che preservano la modality;
- backpressure pull-based e limiti dell'esempio SQLite corrente.

**Checkpoint A9:** verificare ogni matrice start/close/error sui test runtime correnti.

### A10. Documentare ispezione, testing e limiti reali

File: `forma/inspection-and-testing.md`.

Contenuti:

- leggere `describePlan()` e riconoscere origin, modality e lifetime;
- testare comportamento attraverso Composition anziché accedere alle factory interne;
- sostituire realizzazioni tramite Composition;
- package validation e consumer smoke test;
- cosa Forma garantisce staticamente e cosa viene validato a runtime;
- non-goal: IoC container general purpose, service locator, framework applicativo, DSL di
  orchestrazione o gerarchia di cartelle;
- limiti correnti reali: solo composizioni chiuse, nessun merge di composizioni parziali, isolamento
  dell'import graph non imposto dal core, materializzazione del sottoalbero `using` quando il
  Provider viene richiesto;
- stato alpha e policy di breaking change.

Questa pagina descrive confini tecnici verificabili. Non deve trasformarsi in una sezione generica
su applicazioni "troppo semplici" per una buona struttura.

### A11. QA tecnico ed editoriale

Ordine di verifica:

1. confrontare tutti i nomi pubblici con `packages/forma/src/index.ts`;
2. verificare snippet ed esempi contro `forma-demo` o con consumer TypeScript dedicati;
3. controllare che nessuna pagina insegni semantiche superate (`Result`, `bind`, flat surface,
   Adapter come Surface root, factory pubblica);
4. eseguire build del sito;
5. controllare link, sidebar, `/v0` e `/latest`;
6. verificare diagrammi in tema chiaro e scuro e su viewport mobile;
7. fare una review separata di correttezza Forma e qualità editoriale.

**Definition of done del troncone A:** un nuovo utilizzatore può passare dal problema al primo
programma, poi approfondire lifecycle, errori e stream senza ricorrere agli ADR; gli ADR restano la
fonte delle decisioni, non la guida d'uso primaria.

---

## Troncone B — Blog post

### B1. Bloccare tesi, pubblico e promessa

Pubblico: sviluppatori TypeScript e responsabili architetturali che conoscono il costo di sistemi
fullstack cresciuti per pressione locale, con o senza esperienza diretta di agentic coding.

Tesi di lavoro:

> Quando intenzioni, ownership e wiring rimangono impliciti, la velocità di produzione del codice
> accelera il drift architetturale. Rendere espliciti Intent stabili, Boundary e Composition permette
> alle realizzazioni di muoversi senza rendere mobile anche il significato del sistema.

Promessa al lettore: capire un modello architetturale trasferibile, non soltanto imparare una nuova
API.

**Checkpoint B1:** approvare la tesi prima di scegliere titolo e sottotitolo definitivi.

### B2. Costruire la narrazione a partire dalla pressione reale

Sequenza proposta:

1. codice prodotto velocemente e localmente corretto, ma sempre più difficile da possedere come
   sistema;
2. il primo approccio ragionevole: funzioni, moduli, dependency injection manuale e Clean
   Architecture applicata per convenzione;
3. la pressione: ownership ambigua, wiring disperso, seam introdotti troppo presto o troppo tardi,
   cambiamenti concettuali che attraversano molte rappresentazioni;
4. il reframe: il problema non è soltanto iniettare dipendenze, ma stabilizzare intenzioni e rendere
   verificabili le relazioni fra spazi architetturali;
5. far emergere Boundary e Intent prima di nominarli formalmente;
6. introdurre Provider e Composition come separazione fra cosa, come e dove il sistema viene
   collegato;
7. introdurre Adapter quando due Boundary devono collaborare senza condividere il proprio
   linguaggio;
8. usare il caso Editorial per mostrare la scoperta progressiva di Routing;
9. estrarre i pattern: dynamic seams, progressive realization, ownership migration, Entry
   Boundaries ed executable architecture;
10. chiudere sulle conseguenze per evoluzione, navigabilità umana e agentic coding.

Non inventare un fallimento teatrale. La soluzione iniziale deve essere raccontata come ragionevole
finché la crescita del sistema non ne espone i limiti.

### B3. Selezionare il codice minimo

Il blog non deve duplicare la guida tecnica. Prevedere al massimo questi snippet:

1. dichiarazione di Boundary e Intent;
2. Provider con `using`;
3. Adapter che traduce fra due vocabolari;
4. Composition con Entry Boundary, Surface e wiring;
5. eventuale frammento di `describePlan()` solo se rafforza la tesi dell'architettura eseguibile.

Orders può introdurre la sintassi. Editorial deve sostenere l'argomento architetturale. Error
totalization, stream e lifecycle vanno citati come conseguenze del modello e rimandati alla
documentazione, non spiegati integralmente.

### B4. Progettare lo storyboard visuale

Le immagini devono spiegare relazioni difficili da vedere nel codice. Evitare illustrazioni
decorative e diagrammi che si limitano a ripetere uno snippet.

#### Visuale 1 — Il Boundary come spazio semantico

**Scopo:** impedire che Boundary venga letto come cartella, layer o rettangolo organizzativo
generico.

**Schema proposto:** due spazi distinti, `Orders` e `SQLite`, ognuno con i propri Intent e Contract.
I tipi hanno nomi e shape locali. Nessuna freccia attraversa direttamente i due spazi; il wiring è
visibile all'esterno.

```text
┌ Orders ─────────────────┐        ┌ SQLite ──────────────────┐
│ GetOrder                │        │ SelectOrder              │
│ { id } → Order | Error  │        │ { order_id } → Row | Err │
└─────────────────────────┘        └──────────────────────────┘
```

**Messaggio:** ogni Boundary possiede il proprio linguaggio; shape simili non implicano identità.

#### Visuale 2 — Intent stabile, realizzazioni sostituibili

**Scopo:** distinguere il contratto stabile dai modi in cui viene realizzato.

**Schema proposto:** un Intent centrale `Orders.GetOrder` collegato, in due Composition alternative,
a una realizzazione Memory e a una SQLite. Il chiamante e la Surface rimangono invariati.

**Messaggio:** la sostituibilità nasce dalla separazione tra identità e realizzazione, non da un
lookup dinamico globale.

#### Visuale 3 — Adapter come ponte semantico

**Scopo:** mostrare cosa appartiene all'Adapter e perché non è una semplice freccia DI.

**Schema proposto:** `Orders.GetOrder` o un seam locale di Orders sulla sinistra,
`SQLite.SelectOrder` sulla destra, Adapter fra i due con tre trasformazioni esplicite:

```text
Orders input  ──map──> SQLite input
Orders success <─map── SQLite success
Orders error   <─map── SQLite expected error
```

Unexpected Failure e Cancellation attraversano l'Adapter senza essere reinterpretate.

**Messaggio:** l'Adapter realizza l'Intent del target usando il linguaggio di un altro Boundary e
localizza la traduzione.

#### Visuale 4 — Direzione della Composition

**Scopo:** spiegare Entry Boundary, Surface e il divieto di usare un Adapter come entry point.

**Schema proposto:** grafo orientato a strati, senza suggerire layer fisici obbligatori:

```text
Surface
   ↓
Entry Boundary Provider
   ↓ using
Boundary-owned seam
   ↓ realized by
Adapter
   ↓ using
Infrastructure Boundary
```

La Surface e l'Entry Boundary sono evidenziate; Adapter e infrastructure wiring restano nella zona
privata della Composition.

**Messaggio:** la Composition non dice soltanto quali nodi esistono, ma da dove è lecito iniziare a
percorrere il grafo.

#### Visuale 5 — Scoperta progressiva di un Boundary

**Scopo:** sostenere il passaggio centrale del blog con il caso Editorial.

**Formato:** trittico before / pressure / extracted.

1. `Sitemap` possiede `ResolvePath`, con un solo consumatore;
2. anche `PageBuilder` ha bisogno della stessa responsabilità e la duplicazione o dipendenza da
   Sitemap renderebbe ambiguo l'owner;
3. nasce `Routing`: Sitemap viene mantenuto tramite alias durante la migrazione, PageBuilder usa un
   Adapter semantico e Routing viene realizzato attraverso CmsSnapshot.

**Messaggio:** i Boundary non devono essere indovinati tutti all'inizio; possono emergere quando
una responsabilità acquista significato autonomo.

#### Visuale 6 — Dynamic seam / progressive realization

**Scopo:** mostrare che un seam non richiede boilerplate preventivo.

**Formato:** before/after con lo stesso Intent e lo stesso chiamante.

- Prima: il Provider realizza direttamente l'Intent.
- Dopo: il Provider orchestra più Intent, introduce policy o delega a un nuovo Boundary.
- Contract e consumatore restano stabili.

**Messaggio:** ciò che cambia è la realizzazione; non è necessario rendere instabile l'identità
pubblica per far evolvere l'interno.

#### Visuale 7 — Cover editoriale opzionale

**Scopo:** offrire una visuale riconoscibile per indice blog e social card senza trasformare il post
in marketing di prodotto.

**Idea:** una mappa di spazi architetturali collegati da ponti espliciti, con un percorso pubblico
evidenziato e altre realizzazioni sostituibili sullo sfondo. Nessun testo tecnico minuto nella
cover.

**Checkpoint B4:** discutere visuali 1–6 singolarmente. Per ognuna approvare messaggio, semantica,
posizione nel testo e necessità effettiva. Solo dopo scegliere quali produrre.

### B5. Definire il linguaggio visuale e il formato degli asset

Proposta:

- Mermaid per gli schemi referenziali della documentazione tecnica;
- SVG disegnati ad hoc per il blog, dove composizione, ritmo visivo e confronto before/after sono
  parte dell'argomento;
- stessa semantica di colori e forme fra docs e blog, senza dipendere dal colore per distinguere i
  concetti;
- Boundary come area, Intent come nodo nominato, Provider come realizzazione, Adapter come ponte,
  Composition come perimetro di wiring e ownership;
- frecce etichettate (`using`, `realized by`, `surface`) invece di frecce decorative;
- asset sotto `src/assets/blog/forma/`, con nomi semantici;
- alt text e caption che esprimano il punto architetturale, non soltanto gli oggetti visibili;
- verifica su tema chiaro/scuro, mobile e social preview.

Ogni SVG deve avere anche uno sketch testuale sorgente nel piano o nella PR, così la correttezza
semantica può essere revisionata indipendentemente dalla resa grafica.

### B6. Scrivere la prima bozza senza rifinirla prematuramente

Ordine di lavoro:

1. scrivere situazione, pressione e reframe;
2. verificare che l'astrazione sia guadagnata prima di pronunciare "Forma";
3. inserire il caso Editorial come filo concreto;
4. aggiungere soltanto il codice necessario;
5. inserire placeholder delle visuali approvate con caption provvisoria;
6. scrivere la conclusione come conseguenza della storia, non come riepilogo delle feature;
7. scegliere titolo, description e slug solo quando la tesi è stabilizzata.

La conclusione deve concentrarsi su:

- Intent come punti stabili di navigazione;
- Boundary scoperti progressivamente;
- realizzazioni e ownership che possono evolvere;
- seam espliciti quando diventano necessari;
- grafo verificabile anziché wiring implicito;
- un sistema più facile da comprendere e modificare sia per umani sia per agenti.

### B7. Review architetturale ed editoriale

Eseguire due review separate.

**Review architetturale:**

- il post distingue sempre Intent, Provider e realizzazione;
- Adapter e Intent alias non vengono confusi;
- il diagramma di Composition rispetta Entry Boundaries e Surface direction;
- la storia Editorial corrisponde al codice corrente;
- le conseguenze dichiarate sono sostenute dall'implementazione o chiaramente presentate come
  deduzioni.

**Review editoriale:**

- il testo parte dalla pressione reale e non dal prodotto;
- Forma viene nominato dopo che il problema ha fatto emergere il modello;
- non sembra una landing page o un elenco di feature;
- non usa l'agentic coding come espediente retorico generico;
- non introduce un paragrafo artificiale su quando una struttura esplicita sarebbe "troppa";
- alternative ragionevoli non vengono trasformate in strawman;
- ritmo, transizioni e quantità di codice restano coerenti con gli altri articoli xndrjs.

### B8. Integrare e verificare il post

1. creare il file Markdown con frontmatter completo;
2. aggiungere gli asset approvati;
3. aggiornare eventuali link dalla documentazione Forma al blog e viceversa;
4. verificare indice, tag, paginazione e social metadata;
5. eseguire la build del sito;
6. ispezionare la pagina renderizzata su desktop e mobile;
7. fare un'ultima verifica incrociata tra affermazioni, codice e diagrammi.

**Definition of done del troncone B:** il lettore può arrivare all'idea di Forma seguendo una
pressione architetturale reale, comprendere Boundary/Intent/Provider/Adapter/Composition e portare
con sé i pattern di dynamic seam e progressive boundary discovery anche senza adottare subito la
libreria.

---

## Sequenza complessiva raccomandata

I due tronconi condividono il modello, ma non devono essere scritti in parallelo senza checkpoint.

1. creare il content lock dalle fonti correnti;
2. approvare information architecture e indice delle docs (A1);
3. approvare tesi e arco narrativo del blog (B1–B2);
4. scrivere overview, mental model e prima Composition (A2–A4);
5. discutere e approvare lo storyboard visuale (B4–B5);
6. completare le pagine tecniche restanti (A5–A10);
7. eseguire la prima QA tecnica delle docs;
8. scrivere la prima bozza del blog usando le docs come base semantica, non come struttura
   narrativa;
9. produrre soltanto le visuali approvate;
10. eseguire review architetturale ed editoriale separate;
11. integrare navigazione, cross-link e metadata;
12. eseguire build e verifica visuale finale del sito.

## Criterio finale di coerenza

I due deliverable devono rispondere a domande diverse:

- **Documentazione:** "Come uso Forma correttamente e quali garanzie possiede?"
- **Blog:** "Quale pressione architetturale ha reso necessario questo modello e cosa diventa
  possibile una volta che Intent, Boundary e wiring sono espliciti?"

Se un paragrafo risponde alla domanda sbagliata, va spostato o riscritto invece di duplicarlo.
