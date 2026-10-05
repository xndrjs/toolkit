# Human-sounding revision without semantic drift

Use this reference only when the task is to analyze or revise prose that feels formulaic, generic, over-smoothed, or recognizably AI-like.

The source basis is Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), used as a descriptive field guide rather than a detector or style law.
That page is Wikipedia-specific, warns that the signs are not proof of authorship, and says that many occur in human writing too.
Translate only the editorially useful patterns to technical blog prose.

The goal is not to hide provenance.
The goal is a text a careful author could defend sentence by sentence: specific, readable, technically exact, and recognizably theirs.

## The fidelity contract

Treat the original draft and its sources as the semantic specification.
Before changing prose, build an internal content lock containing:

- the thesis and intended conclusion;
- factual claims, names, dates, versions, numbers, units, and chronology;
- actors, ownership, and the layer responsible for each action;
- causal links, dependencies, comparisons, and ordering;
- negations, quantifiers, scope, conditions, exceptions, and trade-offs;
- epistemic strength: `may`, `can`, `usually`, `must`, `always`, and equivalent wording;
- technical terms, definitions, abstraction boundaries, identifiers, code, and API names;
- evidence, links, citations, quotations, and the claim each one supports;
- first-person observations and judgments actually present in the source.

Do not add a fact, mechanism, causal link, example, opinion, or experience merely because it would make the prose more convincing.
Do not narrow or broaden a claim without evidence.
Keep citations attached to the claims they support.
A deletion can change meaning as easily as an addition.
Track every original proposition, including evaluative or weakly supported ones, until it is retained, represented elsewhere without loss, or explicitly surfaced as a proposed substantive deletion.

If the source is ambiguous, prefer the smallest safe edit.
Retain the original wording or flag the ambiguity when a rewrite would require interpretation.

## Diagnose the passage, not its alleged author

Do not declare that a passage "was written by AI."
Identify observable patterns and the editorial risk they create.

Prioritize defects that affect meaning or credibility:

1. **Generic significance.** The prose asserts importance, legacy, transformation, or a broader trend without showing the mechanism or consequence.
2. **Unsupported synthesis.** A trailing clause such as `highlighting`, `underscoring`, `reflecting`, or `contributing to` adds an interpretation that the preceding fact does not establish.
3. **Promotional evaluation.** Praise, grandiosity, or sales language stands in for observable behavior.
4. **Vague relationships.** `Associated with`, `connected to`, or similar wording obscures the actual role, action, or boundary.
5. **Vague attribution.** `Experts`, `critics`, `industry reports`, or `several sources` inflate or hide the available evidence.
6. **Unsupported certainty.** A rewrite turns possibility into necessity, correlation into cause, or one example into a general rule.
7. **Canned closure.** A conclusion recaps the article, gestures toward future opportunities, or resolves every tension with generic optimism.
8. **Residue.** Chat-oriented preambles, offers of further help, placeholders, invented-looking citations, or instructions to the writer remain in the deliverable.

Then look for local clusters of formulaic style:

- inflated vocabulary where a plain or precise verb would do;
- avoidance of simple `is`, `has`, `uses`, `wrote`, `tried`, or their equivalents;
- repeated sentence openings such as `This is`, `That is`, `Additionally`, or `At this point`;
- repeated negative parallelism: `not only X but Y`, `not X but Y`, `Y rather than X`;
- repeated triads or suspiciously symmetrical lists;
- sentence-ending participial glosses that claim significance without evidence;
- several emphatic short sentences in succession;
- uniform sentence length or syntax;
- a heading for every small turn in the argument;
- blockquotes, boldface, rhetorical questions, or em dashes used as automatic emphasis;
- meta-prose that announces what the article or section is about to do;
- a paragraph whose last sentence merely restates the preceding sentences.

No item in this second list is a ban.
Frequency, proximity, and function matter more than the token itself.

## Revise in this order

### 1. Repair the underlying reasoning

Do not polish an unsupported claim.
Either ground it in information already present, attribute it accurately, or preserve it and flag the evidentiary problem.
Do not silently delete it merely because it sounds generic or makes the passage harder to humanize.

Remove a redundant sentence only when its complete proposition remains elsewhere in the revision.
If a claim contributes no supported content and is not redundant, present its removal as a substantive suggestion unless the user explicitly authorized that kind of cut.

Replace generic evaluation with the concrete mechanism or consequence already established by the draft.
If the draft does not contain one, do not invent it.

Name the actor and relationship only when the source supports that precision.
One source must not become `many observers`; an association must not become ownership; sequence must not become causality.

### 2. Make the syntax direct

Prefer the simplest verb that remains technically exact.
`Is`, `has`, and `uses` are often better than ornamental substitutes such as `serves as`, `boasts`, or `leverages`.

Remove an interpretive `-ing` tail when it merely announces significance.
When it contains a supported consequence, give that consequence its own clear clause and show the relationship.

Use transitions only when they encode cause, contrast, consequence, qualification, or sequence.
Do not add transitions merely to make paragraphs feel polished.

### 3. Break templates without randomizing the prose

Let the content decide how many examples or list items exist.
Do not force a triad, but do not dismantle a useful set of three.

Use `not X, but Y` when the article has genuinely earned a conceptual correction.
Remove or recast nearby repetitions so the real reframe keeps its force.

Vary sentence length by following the reasoning:

- combine facts that form one causal or comparative unit;
- split a sentence when a consequence deserves attention;
- keep a short sentence when it changes the reader's model;
- avoid random alternation added only to manufacture "burstiness."

Use prose for an argument, a list for genuinely parallel items, code when syntax matters, and a diagram when relationships matter.
Do not convert useful structure merely to look less generated.

### 4. Restore the author's pressure and point of view

For xndrjs articles, prefer the concrete production constraint, failed boundary, ownership problem, or implementation consequence over a generic claim about importance.

Preserve real first-person experience, fair judgments about earlier approaches, and distinctive sentences.
Never invent an incident, mistake, emotion, quotation, number, or personal memory.

Keep technical terminology consistent.
Repeating the correct term is better than rotating through near-synonyms that imply different concepts.

Verve comes from specificity and earned judgment:

- a strong verb instead of an inflated adjective;
- a concrete consequence instead of a claim of significance;
- one decisive sentence after the evidence instead of several slogans;
- a real trade-off instead of a balanced-sounding disclaimer;
- an explicit ownership boundary instead of architectural mood music.

### 5. End on consequence, not ceremony

Do not add `In conclusion`, `Overall`, a generic `Challenges and future prospects` section, or a final summary by default.

The ending may:

- state the architectural consequence that the article earned;
- identify the boundary or decision that now changes;
- acknowledge the remaining trade-off;
- crystallize one memorable principle already supported by the journey.

Stop when the argument is complete.

## Weak indicators and false positives

Do not edit a passage merely because it contains:

- correct grammar;
- formal, academic, technical, bland, or highly polished prose;
- a mix of conversational and formal register;
- one transition word;
- an em dash, curly quotation marks, boldface, Markdown, a list, or a table;
- one triad, rhetorical question, or negative parallelism;
- repetition of an exact technical term;
- a sentence or paragraph of unusual length.

These may be appropriate to the author, genre, or information.
The xndrjs reference articles intentionally use some of them.

Do not use a fixed blacklist of words.
Terms such as `robust`, `crucial`, `pivotal`, `landscape`, `highlight`, `showcase`, or `underscore` become useful warnings only when they cluster or substitute for actual content.
Apply the same principle in languages other than English; do not mechanically translate the watchlist.

## Never "humanize" by degradation

Do not:

- insert typos, grammatical mistakes, slang, or inconsistent punctuation;
- add fake uncertainty or remove a necessary qualification;
- invent anecdotes, preferences, emotions, or a first-person persona;
- use a thesaurus to avoid every repeated word;
- replace precise technical language with casual approximations;
- remove all headings, lists, boldface, blockquotes, or dashes;
- add tangents, jokes, parentheticals, or fragments at random;
- optimize for detector scores, perplexity, or burstiness;
- claim that the revision is human-authored or undetectable.

## Semantic diff

After the prose pass, compare the revision with the content lock.

Run the comparison in both directions:

- every revised proposition must map to an original proposition or to evidence the user supplied;
- every original proposition must map to the revision, remain elsewhere without reduced scope, or appear in an explicit note proposing its removal.

This catches both invention and silent deletion.
Check, sentence by sentence, that the edit has not changed:

- who did what;
- what caused what;
- what is known versus inferred;
- what is possible versus required;
- what applies always versus under a condition;
- the direction of a comparison;
- a negation, exception, limitation, or trade-off;
- a number, version, unit, sequence, or identifier;
- the meaning of a technical term or abstraction boundary;
- the scope of a citation or quotation;
- the author's actual experience or degree of conviction.

If a change fails this check, revert it or surface it as a substantive suggestion rather than silently applying it.

## Acceptance check

Before delivering the revision, verify that:

- concrete details survived the edit;
- no new fact, cause, anecdote, or consensus appeared;
- each evaluative sentence is supported by an observed mechanism or is clearly presented as the author's judgment;
- each transition expresses a real relationship;
- local repetitions of the same rhetorical template have been reduced;
- strong lines remain, but emphasis is not stacked mechanically;
- headings, lists, code, and diagrams still serve the information;
- the conclusion advances or lands the argument instead of reciting it;
- reading aloud reveals neither staccato monotony nor inflated syntactic bulk;
- the text still sounds like the source author, not like a generic "humanized" rewrite.

Match the output to the requested mode:

- for analysis only, provide the protected semantic spine, observed pattern clusters with examples, and fidelity risks; do not rewrite the text;
- for revision only, return the revised text without annotating every cosmetic change, plus concise flags for issues that cannot be fixed without changing meaning;
- for analysis and revision, provide the semantic spine, pattern diagnosis, revised text, and a short fidelity note for substantive or ambiguous edits.
