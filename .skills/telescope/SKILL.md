---
name: telescope
description: Plan, analyze, and explain through a minimal conceptual model and progressively increasing detail. Use for feature plans, system design, architecture discussions, process analysis, and explanations where the reader needs a clear big picture before implementation details. Also use when asked for Telescope, progressive disclosure, fewer abstractions, or a more human-friendly explanation.
---

# Telescope

Build the smallest useful model. Show its complete map. Then increase resolution.

Let the reader stop early and lose detail without losing orientation.
Apply this to both the model you propose and the way you present it.

## 1. Compress the model

Find the smallest coherent set of concepts that represents the requested scope.

- Start from goals, responsibilities, and meaningful distinctions in the problem.
- Before adding a concept, try expressing the requirement with existing concepts.
  Add one only when reuse would lose a meaningful distinction or obscure the model.
- Reuse names consistently. Give each concept one clear meaning.
- Justify a new concept through a distinct responsibility, behavior, constraint,
  or guarantee. A slightly different shape, processing stage, or implementation
  layer alone does not justify a separate concept.
- Account for the states, operations, rules, and decisions a new concept introduces.
  Justify that added complexity through requirements. For example, a date filter
  does not by itself justify a period entity with a closure workflow.
- Preserve distinctions that affect correctness. Avoid merging unrelated
  responsibilities or making one generic object carry many conditional meanings.
- When discussing an existing system, use its vocabulary and describe it
  faithfully. Distinguish proposed simplifications from what already exists.

Minimize the reader's conceptual burden, not merely the number of types or words.
Reuse a representation when it fits; introduce another when its distinction matters.

## 2. Show the complete map

Open with the purpose and a short map of the whole requested scope.

Choose the organizing lens that makes the subject understandable: use cases,
responsibilities, questions, or stages. For a feature plan, prefer the capabilities
the system must provide before listing internal components.

For each map item, state what it does or answers. Include its main input and
outcome when useful. Make the relationships between items clear.

Keep the opening at one level of abstraction. Defer schemas, class names,
file lists, and implementation mechanics until the reader knows why they matter.

Surface assumptions, uncertainties, and decisions here if they change the
overall direction. A material limitation must not first appear as a footnote
deep in an implementation section. Do not invent certainty to complete the map.
Keep assumptions about scope plain and brief. Place local assumptions in the
relevant branch. Avoid digressions into excluded cases or hypothetical extensions
that create decisions the requested feature does not require.

Introduce a small shared vocabulary here only when it helps explain the whole.
Introduce concepts used by just one branch within that branch. Do not make every
possible concept look equally fundamental through an upfront glossary.

Make the map complete at its resolution, not exhaustive in its detail.

## 3. Increase resolution

Expand the map to the depth the user requested.

- Expand one branch at a time. Tie it visibly to an item in the map.
- Within a branch, show its small local map before expanding its parts.
  Introduce the necessary concepts and their roles before detailing their
  interactions, contracts, algorithms, or implementation.
- Introduce each concept with its immediate purpose. Show how it connects
  to concepts already established.
- Finish the map at each level before descending into one of its children.
  Let later detail refine earlier understanding.
- If a detail changes the overall picture, move its implication up to the
  relevant overview.

Use explicit headings or scope labels when they help navigation, such as
"Resolve a path — required concepts" and "Resolve a path — lookup flow".
Prefer meaningful labels to "Level 1" or "Level 2". Adapt the number of levels
and headings to the task; do not impose a fixed template. Include a section only
when it helps this explanation. Do not automatically fill sections for assumptions,
concepts, open decisions, or acceptance criteria merely to complete a document.

Avoid forward references that require the reader to hold an unexplained term,
dependency, or promised justification in memory. Define the prerequisite first,
give a sufficient local explanation, or reorder the material. Referring to another
mapped responsibility is fine when its role is already clear.

Keep the model compact and the prose easy to understand on the first reading.
Give each concept the words it needs. Do not compress syntax to save words:
unpack dense clauses, omitted connections, and ambiguous qualifiers. Split
independent claims into separate sentences, or remove claims that do not help here.

Keep sections short and give each paragraph or list item one job. Use technical
terms when they add precision. Avoid slogans, corporate shorthand, and remarks
about your own response process. State what is uncertain directly rather than
announcing that you are avoiding invented certainty.

Prefer a small concrete example over several abstract restatements. Remove
filler, repeated summaries, unnecessary terminology, and speculative abstractions.
Preserve detail needed for a correct decision or implementation. Optimize for
the effort needed to understand, rather than the fewest possible words.

For a simple question, answer directly; do not manufacture a hierarchy.
For a detailed request, complete the requested depth in the same response.
Do not turn progressive disclosure into repeated requests for permission to continue.

## Example: opening and first expansion

Use this as an illustration of structure, not a required pagebuilder architecture.

**Pagebuilder — routing and data**

Three use cases:

- Resolve a full path to a page ID: `/ww/en/home → 12345`.
- Load a page and its required data by ID: `12345 → page data`.
- Enumerate page URLs for the sitemap: `site → URLs`.

Path resolution supplies the ID used to load page data. Sitemap generation
enumerates the published URLs.

**Resolve a path — required concepts**

- **Path:** the ordered slugs identifying a location.
- **Page ID:** the reference used to load the identified page.

The use case finds the page ID associated with the path. Retrieving the page's
content and integration data belongs to the second use case.

## Before sending

Check silently:

- Can someone who reads only the opening explain the purpose and major responsibilities?
- Does every detail have a recognizable place in the map?
- Does every new concept earn its place, or could an existing one cover it?
- Does the complexity introduced by each concept follow from the requested scope?
- Can the reader understand each section without waiting for a later explanation?
- Can the reader understand each sentence directly, without decoding compressed phrasing?
- Is the requested scope covered, with necessary uncertainty and distinctions preserved?
