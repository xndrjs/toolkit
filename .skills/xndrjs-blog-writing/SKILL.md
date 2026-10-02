---
name: xndrjs-blog-writing
description: Write and edit technical blog posts in Fabio Fognani's architectural writing style. Use for articles, drafts, outlines, rewrites, and editorial reviews for the xndrjs / software architecture blog.
---

# Blog Writing Style

Use this skill when writing or editing technical articles for this blog.

The goal is not to imitate generic developer-blog prose.

Articles should feel like an architectural discovery:
a concrete engineering problem creates pressure, attempted solutions expose the wrong abstraction, and a better conceptual model eventually emerges.

## Core writing model

Prefer this progression:

Concrete problem
→ reasonable first approach
→ where it starts to hurt
→ failed or insufficient attempts
→ identify the hidden conceptual mistake
→ reframe the problem
→ introduce the abstraction
→ show its consequences
→ extract a broader architectural principle

A good article should make the abstraction feel earned.

Do not begin with an abstract principle and then search for examples to justify it.

Whenever possible:

> start from the mess and let the abstraction fall out of it.

## Prefer naming only after the thing exists

Prefer naming a thing only after the article has demonstrated that the thing exists.

Avoid opening with:

> “Today we'll introduce Resource Graph Resolution.”

Prefer arriving at the name after the reasoning has earned it:

> “At this point, calling this ‘data fetching’ had stopped being useful. We were resolving a graph.”

The name should feel like a recognition, not a product announcement.

## Reference articles

When voice or structure is ambiguous, inspect the examples under `references/`.
Those paths are symlinks to the live blog posts in `apps/xndrjs-documentation` — read them as the canonical articles, not snapshots.

- [references/every-component-fetches.md](references/every-component-fetches.md)
- [references/addressable-resource-identifiers.md](references/addressable-resource-identifiers.md)
- [references/resource-graph-resolution.md](references/resource-graph-resolution.md)

Use them to infer:

- pacing;
- paragraph length;
- transition style;
- amount of code;
- how architectural conclusions are introduced.

Do not copy phrases or reproduce their structure mechanically.
They are examples of reasoning and voice, not templates.

---

# Tone

Write as an experienced engineer thinking through a real problem.

The tone should be:

- technical;
- direct;
- conversational;
- precise;
- skeptical of unnecessary complexity;
- opinionated when the argument supports it;
- comfortable admitting earlier approaches were wrong or incomplete.

Avoid:

- corporate marketing language;
- academic stiffness;
- tutorial-blog filler;
- exaggerated claims;
- fake excitement;
- motivational language;
- artificial controversy;
- "X is dead" / "you are doing X wrong" framing;
- listicle-style writing unless the structure genuinely calls for a list.

Do not sound like documentation.

Do not sound like a product landing page.

Do not sound like a textbook.

---

# Start from production pressure

Prefer real constraints over toy examples.

Good sources of pressure include:

- a UI gradually becoming an orchestration layer;
- deeply nested CMS content;
- heterogeneous APIs;
- infrastructure leaking into application code;
- batching and deduplication;
- cache boundaries;
- type systems being asked to carry the wrong information;
- abstractions that worked locally but failed at scale;
- excessive glue code;
- multiple teams or systems disagreeing about ownership.

When describing an earlier solution, treat it fairly.

It was usually reasonable given the information available at the time.

The point is not:

> "This was stupid."

The point is:

> "This worked until the system placed enough pressure on the abstraction to reveal what it was really modeling."

---

# Reframing is central

Many articles should contain a moment where the apparent problem is replaced by the actual problem.

Typical pattern:

> We thought the problem was X.

> But X was only a symptom.

> The actual problem was Y.

Examples of the kind of reframing this blog favors:

- not "how do we fetch this efficiently?"
  but "we are traversing a resource graph";

- not "how do we give the UI access to the ContentMap?"
  but "the ContentMap is not the aggregate";

- not "how do we encode more information into IDs?"
  but "we are asking identity types to carry knowledge that belongs elsewhere";

- not "which helper should perform this request?"
  but "which layer should own this orchestration?"

Use reframing only when it genuinely follows from the argument.

Do not manufacture dramatic revelations.

---

# Abstractions must pay rent

Never introduce an abstraction merely because it is elegant.

Show what concrete complexity existed before it.

Prefer:

> This logic already existed in the system. We made it explicit.

over:

> This abstraction may be useful someday.

Favor YAGNI.

A new abstraction should normally:

- remove duplicated knowledge;
- create a clearer boundary;
- raise the level at which developers can reason;
- make infrastructure replaceable;
- turn procedural glue into explicit semantics;
- or make previously implicit invariants checkable.

If it does none of these, question whether it belongs in the article.

---

# Abstraction levels

A recurring architectural concern in this blog is mixing different levels of abstraction.

Look for situations where code forces the reader to switch repeatedly between:

- application intent;
- orchestration;
- resource identity;
- transport;
- caching;
- serialization;
- framework details.

Prefer explaining systems in terms of distinct conceptual levels.

A useful principle is:

> Physical boundaries should coincide with changes in abstraction level.

Another useful heuristic:

> The higher the level of composition, the coarser the building blocks should become.

Do not force these phrases into every article, but preserve the underlying reasoning.

---

# Architecture over framework advocacy

Discuss frameworks and technologies fairly.

Do not write:

> GraphQL cannot do this.

Prefer:

> GraphQL can solve this, but doing so places the orchestration behind a GraphQL execution boundary. That was not the boundary this system needed.

Distinguish:

- capability;
- abstraction boundary;
- operational cost;
- ownership;
- adoption cost.

Avoid "technology A vs technology B" feature-checklist articles.

The interesting question is usually:

> Where does this approach place the complexity, and who owns it?

---

# Memorable principles

Articles may crystallize an argument into short, memorable statements.

Examples of the desired style:

> The ContentMap is for the machine. The projection is for the developer.

> Rendering should consume the resolved graph, not discover it.

> More types do not necessarily mean better boundaries.

> Changing aggregation should mean editing a declaration, not refactoring a pipeline.

These statements should summarize reasoning already established by the article.

Never invent slogans first and build the article around them.

Prefer one strong sentence over several weaker ones.

---

# Examples and diagrams

Use small examples that expose the architectural point.

Prefer realistic examples such as:

```text
Page
 ├─ Hero
 │   └─ Asset
 ├─ Tabs
 │   └─ Tab
 │       └─ Strip
 └─ Product
     └─ external API
```

Use code when syntax itself matters.

Use diagrams when relationships matter.

Use prose when behavior or trade-offs matter.

Do not use code merely to make an article look technical.

Keep snippets small enough that the reader can understand why they are present.

---

# Comparisons

When comparing approaches, first acknowledge what the alternative does well.

Then identify the boundary that differs.

Good:

> A BFF can absolutely solve this problem. If a stable endpoint can expose the aggregate, that may be the simplest solution.

> The interesting case begins when the aggregate is intrinsically compositional, its shape is data-dependent, or building another backend becomes the bottleneck.

Bad:

> BFFs do not scale.

Avoid strawmen.

---

# First-person experience

First person is welcome when the article comes from production experience.

Examples:

> I initially tried...

> This looked reasonable.

> Then the page model became deeper.

> At that point I realized...

Do not overuse autobiographical narration.

The experience exists to support the technical argument.

Admitting mistakes is valuable when the mistake reveals something architectural.

---

# Structure

Do not mechanically use identical headings in every article.

However, a typical article may naturally resemble:

1. The situation
2. The obvious solution
3. Where it breaks
4. Attempts to patch it
5. The conceptual mistake
6. A different model
7. Implementation / architecture
8. Trade-offs
9. What this changes

The transitions matter more than the headings.

Each section should create pressure for the next one.

---

# Paragraph style

Prefer cohesive paragraphs over sequences of isolated one-line statements.

Short standalone sentences are useful for emphasis, but should be rare enough to remain effective.

Avoid **staccato prose**: a sequence of short declarative sentences that all have the same shape, repeat the same modal verb, or read like bullet points separated by periods. This is especially mechanical when several adjacent sentences enumerate possibilities one at a time:

> The root may come from one system. A child may come from another. A link may require decoding. A product may require another API.

When those observations belong to one thought, connect them into a naturally paced sentence or paragraph:

> The root may come from one system while its children come from another; some links can be followed directly, whereas others must be decoded before the target resource is even known.

Vary sentence length and structure. Let clauses express relationships such as contrast, consequence, qualification, and accumulation instead of resetting the rhythm with a full stop after every fact. Do not merely join unrelated sentences to make them longer: the goal is natural argumentative flow, not syntactic bulk.

Use a short sentence when it creates deliberate emphasis. Avoid several emphatic short sentences in succession, because the effect quickly becomes mechanical.

Avoid excessively long paragraphs.

Technical density is acceptable, but the reasoning should remain easy to follow.

Use terminology consistently.

If a new term is introduced, explain why the existing vocabulary is insufficient.

---

# Editing existing drafts

When editing an existing article:

1. Preserve the author's thesis unless explicitly asked to challenge it.
2. Preserve useful production details.
3. Remove generic filler.
4. Look for places where the article jumps to an abstraction before earning it.
5. Strengthen causal links between sections.
6. Identify duplicated explanations.
7. Simplify terminology where two concepts are unnecessarily overlapping.
8. Flag claims that are stronger than the evidence.
9. Preserve distinctive sentences when they carry the author's voice.
10. Do not rewrite everything merely to make the prose smoother.

Prefer surgical editing over homogenization.

---

# Architectural criticism

Do not automatically agree with the author's design.

When reviewing a draft or idea, distinguish between:

- a real architectural insight;
- an implementation detail;
- an accidental constraint;
- a premature abstraction;
- a framework-specific concern being mistaken for a general principle.

If a simpler explanation or architecture exists, say so.

The blog should not become advocacy for xndrjs.

Credibility comes from being willing to say:

> This may be unnecessary for simpler applications.

or:

> If you already have a good BFF exposing this aggregate, use it.

---

# Final quality check

Before finalizing an article, ask:

- What concrete problem starts the story?
- Why was the first solution reasonable?
- What pressure caused it to fail?
- What was the actual conceptual mistake?
- Is the new abstraction earned?
- Does the article clearly distinguish semantics from implementation details?
- Are alternatives represented fairly?
- Is there unnecessary abstraction?
- Is there at least one idea the reader can carry into systems unrelated to the specific technology?
- Does the conclusion follow from the journey rather than merely repeat the introduction?
- Are names introduced only after the thing has been demonstrated?
- Does the prose have a natural rhythm, or do any paragraphs read like bullet lists with periods?

If the article could have been written without any real engineering experience behind it, it is probably still too generic.
