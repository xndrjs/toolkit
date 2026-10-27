# Struttura — contesto della nuova direzione

Voglio ripensare `@xndrjs/struttura` come un piccolo strumento di scaffolding, discovery della codebase e sincronizzazione di regioni esplicite nei file. Un riferimento utile è «Plop on steroids».

Questo documento serve a trasferire il contesto e a valutare una soluzione minima. Le API mostrate sono indicative, non contratti già definitivi. Prima di implementare un framework completo, verifica quanto possiamo ottenere riutilizzando Plop.

## Da dove arriviamo

Ho realizzato più iterazioni di Struttura basate su costrutti architetturali, artefatti e popolamento dichiarativo del repository. Le ultime versioni avevano generazione, file scaffold/sync, identità persistenti e riconciliazione per spostare o cancellare gli artefatti.

Ho rimosso il package e la demo app: anche l'ultima iterazione non soddisfaceva le aspettative. Non assumere quindi che la vecchia implementazione sia ancora presente nel repository.

Il problema era l'indirezione mentale: risultava difficile prevedere cosa sarebbe successo modificando il repository in parte attraverso il popolamento e in parte a mano. La potenza aggiuntiva rischiava di rendere più fragile la manutenzione.

La nuova direzione sostituisce i precedenti prompt. Non voglio ripristinare `architecture.ts`/`population.ts` come modello autorevole del repository, né riconciliazione, cancellazioni automatiche, ontologie di costrutti o un nuovo sistema di identità degli artefatti.

## Obiettivo e responsabilità

Voglio poter aggiungere un package, un modello o un altro elemento secondo le convenzioni del progetto senza copia-incolla e adattamenti manuali. Voglio inoltre mantenere allineati alcuni punti del codice in modo esplicito e prevedibile.

Le capacità sono tre:

1. **Scaffold:** crea file e cartelle in una destinazione scelta.
2. **Discovery:** legge la codebase, individua destinazioni valide e ricava informazioni dalle convenzioni esistenti.
3. **Sync:** aggiorna soltanto il contenuto delle regioni marcate nei file, mediante generatori registrati.

Scaffold e sync sono operazioni distinte. Il filesystem reale è la fonte delle informazioni. Il comportamento deve funzionare anche su codice scritto a mano o prodotto da altri tool.

## Scaffold

Un primo generatore crea un package core con directory come `models/`, `operations/`, `ports/` e relativi `index.ts` iniziali. Questi file vengono scaffoldati: la creazione non implica un successivo aggiornamento automatico.

Un secondo generatore crea un modello in un core esistente:

```text
{corePath}/models/{modelName}.model.ts
```

Deve essere possibile scegliere anche una sottodirectory esistente o definirne una nuova. Esempio:

```text
packages/core-pagebuilder/models/strips/{modelName}.model.ts
```

Le policy desiderate per i file già presenti sono:

- `skip`: conserva il file e salta la creazione;
- `overwrite`: sostituisce il contenuto;
- `throw`: segnala il conflitto.

Una directory esistente può essere riutilizzata per creare i figli. La policy di overwrite non deve diventare una sostituzione ricorsiva indiscriminata delle directory.

## Discovery della codebase

Chiedere soltanto un path libero sarebbe fragile: un generatore di modelli potrebbe essere indirizzato a `operations/` anziché `models/`.

Serve un meccanismo che permetta di:

- leggere directory e file nel perimetro configurato;
- filtrare le destinazioni possibili secondo criteri del generatore;
- dedurre informazioni dal path;
- restituire candidati selezionabili e utilizzabili anche senza interazione.

Per iniziare possono bastare glob/regex, gruppi nominati e funzioni di filtro/mapping. Non occorre inventare un linguaggio di query o un modello architetturale persistito.

Per esempio:

```ts
/^packages\/core-(?<coreName>[^/]+)\/models$/;
```

può produrre un risultato temporaneo equivalente a:

```ts
{
  path: "packages/core-pagebuilder/models",
  label: "pagebuilder",
  data: { coreName: "pagebuilder" },
}
```

La convenzione dei path rende possibile riconoscere anche directory create manualmente. Non voglio aggiungere metadati a ogni package per renderlo individuabile.

La scelta della sottodirectory avviene sotto una base valida, per esempio `models/`, senza consentire di uscire da quella destinazione.

La stessa validazione deve essere applicata durante l'esecuzione non interattiva: un argomento passato direttamente non può aggirare i criteri mostrati dalla selezione interattiva.

## Sync di regioni esplicite

L'idea è delimitare le porzioni gestite con marcatori:

```ts
// @xndrjs-sync start myCustomId
// contenuto prodotto dal generatore
// @xndrjs-sync end myCustomId
```

Il contenuto interno viene sostituito dal risultato di una funzione registrata, preservando il resto del file e i marcatori:

```ts
api.syncGenerator("myCustomId", (ctx) => {
  // ctx permette di leggere la codebase
  // e identifica file e directory della regione corrente.
  return "...";
});
```

L'ID identifica il generatore: può comparire in più file. Ogni regione viene elaborata nel proprio contesto locale. Non serve un'identità architetturale persistente per ogni occorrenza.

Discovery e sync devono poter condividere le stesse primitive di lettura della codebase: elenco dei file, filtri, estrazione di nomi e calcolo di path relativi. La forma precisa di `ctx` è da progettare.

Questo permette di aggiornare barrel, registrazioni o altri elenchi sulla base del codice realmente presente, compreso quello handwritten. Più punti del codice possono usare le stesse regole di discovery per restare coerenti.

Un generatore scaffold può inserire i marcatori iniziali. Anche un file scritto a mano può partecipare al sync aggiungendo i marcatori. L'aggiornamento avviene attraverso un'operazione sync esplicita.

Per una prima versione: marcatori bilanciati, regioni non annidate e diagnostiche prima della scrittura in caso di delimitazioni ambigue o malformate. Perimetro di scansione, esclusioni e dettagli del contesto vanno definiti concretamente.

## Ipotesi: usare Plop come engine

Vorrei evitare di riscrivere lo scaffolding se possiamo usare Plop, aggiungendo soprattutto:

- discovery e informazioni ricavate dalla codebase;
- generatori sync basati sui marcatori;
- eventualmente una CLI sottile adatta sia alle persone sia agli agenti AI.

Dalla documentazione ufficiale consultata emerge che Plop supporta il bypass dei prompt anche per nome, ma i parametri mancanti possono ancora richiedere interazione. `node-plop` espone invece il motore programmatico, separando `runPrompts` e `runActions`.

Esempio con un ipotetico generatore `model` definito nel plopfile:

```ts
import nodePlop from "node-plop";

const plop = await nodePlop("./plopfile.js");
const generator = plop.getGenerator("model");

const result = await generator.runActions({
  name: "page",
  corePath: "packages/core-pagebuilder",
});
```

Plop documenta inoltre `add`, `addMany`, `skipIfExists`, `force` e action personalizzate. Queste funzionalità rendono plausibile il riuso del motore; non abbiamo ancora verificato l'integrazione con una prova eseguibile.

Riferimenti ufficiali:

- [Documentazione Plop](https://plopjs.com/documentation/)
- [README di node-plop](https://github.com/plopjs/plop/blob/main/packages/node-plop/README.md)

La scelta di adottare Plop non è ancora definitiva. Valuta prima un'integrazione piccola e concreta, senza costruire un'astrazione generale per poter cambiare engine in futuro.

## Uso non interattivo e agenti AI

La difficoltà incontrata in passato era usare Plop comodamente senza interazione. Vorrei un percorso che consenta di:

- elencare generatori e input richiesti;
- ottenere le destinazioni valide e i dati derivati in un formato leggibile da macchina;
- fornire input nominati o JSON;
- ricevere un errore immediato per input mancanti o non validi, senza restare in attesa di prompt;
- ottenere risultati strutturati ed exit code coerenti.

Validazione, valori derivati e regole di selezione devono essere condivisi tra percorso interattivo e non interattivo. Non dare per scontato che passare un oggetto a `runActions` applichi automaticamente le validazioni dei prompt.

## Primo passo richiesto

Esamina il repository e proponi il modello minimo per questi tre bisogni. Parti da una prova che:

1. riusi un generatore Plop per creare un package;
2. scopra una destinazione valida e crei un modello, anche in sottodirectory;
3. aggiorni un barrel tramite una regione marcata;
4. sia eseguibile senza prompt usando gli stessi controlli del percorso interattivo.

Mostra come verrebbero definiti i generatori e invocati i comandi. Distingui ciò che possiamo delegare a Plop dalle funzionalità nuove necessarie in Struttura, e chiarisci i limiti emersi dalla prova prima di ampliare il progetto.
