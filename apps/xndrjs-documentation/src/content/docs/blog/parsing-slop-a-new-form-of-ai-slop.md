---
title: "Parsing-slop: a particular form of AI slop"
description: When AI never names a shape, every file becomes a parser — why parsing-slop spreads, what it costs, and why every boundary deserves an explicit shape.
date: 2026-06-16
author: Fabio Fognani
tags:
  - ai
  - architecture
  - domain
  - validation
---

Recently, while programming with AI assistants, I found myself repeating the same piece of feedback over and over again:

> Don't do custom parsing. Avoid parsing-slop. Define a schema instead.

At first, I assumed these were isolated episodes. Then I realized I was observing a recurring pattern — one that appears so frequently in AI-generated code that it deserves a name of its own.

I call it **parsing-slop**.

## What is parsing-slop?

Parsing-slop is a form of AI-generated code where data structures are not explicitly modeled. Instead, their shape is guessed, validated, and pieced together - locally and incrementally - wherever they are consumed.

It often looks like this:

```typescript
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

if (isRecord(data)) {
  const title = data.title;

  if (typeof title === "string") {
    // ...
  }
}
```

On its own, there is nothing wrong with this code. The problem begins when the same pattern appears everywhere — and is asked to validate structures that were never named.

One consumer walks a nested object with a dozen fields. Another branches on a polymorphic payload — different shapes behind the same entry point. A third mixes strings, nested records, arrays, and optional keys in one inline parser. A fourth reimplements a slightly different version of the same contract because it only needs a subset today.

The shape of the data exists, but it is never **declared**. It is rediscovered repeatedly by every consumer.

This is **parsing-slop**.

If you have read [AI doesn't make Domain-Driven Design less important](/blog/ai-makes-domain-driven-design-essential/), you may recognize the same smell in a longer `parseArticleSummaryRow` function: correct locally, duplicated globally, and hard to keep aligned when the contract moves.

## Why AI generates it so often

Large Language Models optimize locally.

When presented with an `unknown` value, the safest solution is usually to inspect it directly:

```typescript
typeof value === "string";
Array.isArray(value);
"id" in value;
```

These checks are easy to generate, difficult to get wrong, and usually satisfy the immediate requirement.

The model solves the problem in front of it.

What it does not naturally do is stop and ask:

> Should this data structure have a name?

Or:

> Is this shape already known somewhere else in the system?

As a result, assumptions that should exist in a single location become scattered throughout the codebase.

## Parsing by consumption vs parsing by declaration

At its core, parsing-slop is a consequence of a particular style of validation.

### Parsing by consumption

```typescript
if (typeof value === "string") {
  // ...
}
```

The consumer discovers the structure while using it.

### Parsing by declaration

```typescript
const ArticleSchema = z.object({
  title: z.string(),
  slug: z.string(),
});
```

The structure is defined once and consumed everywhere else. The difference is subtle but profound. In the first case, knowledge is distributed. In the second case, knowledge is centralized.

## The hidden cost

Parsing-slop rarely causes immediate bugs: that's precisely why it spreads. The costs appear later:

- **Semantic duplication** — the same contract is expressed in many different ways.
- **Contract drift** — different parts of the system begin accepting different variations of what is supposedly the same data.
- **Accidental complexity** — simple changes require updating multiple unrelated parsing branches.
- **Reduced understandability** — nobody can answer "What is the shape of this thing?" The answer becomes: "It depends where you look."

## When the same data arrives in different forms

The problem becomes much worse when the **same logical data** can arrive in **different shapes** from the sources you already use — not because the domain changed, but because the transport layer did.

A familiar example from [Contentful](/blog/generating-zod-schemas-from-contentful/): fetch an entry with a single locale, and `title` is a string:

```json
{ "title": "Hello" }
```

Fetch with `?locale=*`, and the same field becomes a record of locale codes:

```json
{ "title": { "en-US": "Hello", "it-IT": "Ciao" } }
```

Same field. Two completely different shapes.

Without explicit modeling, AI assistants tend to generate a single parser that tries to handle both:

```typescript
function parseSomething(fields: unknown): { title: string } {
  if (!isRecord(fields)) throw new Error("...");

  const title = fields.title;

  if (typeof title === "string") {
    return { title };
  }

  if (isRecord(title)) {
    // multi-locale — pick a locale?
    ...
  }

  throw new Error("...");
}
```

That is parsing-slop in miniature: the contract was never named, so every consumer has to rediscover whether `title` is a string or a locale map. The Contentful post walks through the structured alternative — separate transport and flat schemas, generated once at the boundary.

Over time, this kind of function becomes a graveyard of historical assumptions.

Every new variation adds another branch.

Eventually nobody understands which shapes are actually supported and which are simply artifacts of previous implementations.

## Parsing-slop is not just a domain problem

At first glance, this sounds like a Domain-Driven Design problem. And DDD certainly helps.

A strong domain model makes it much easier to recognize when data is leaking through the wrong boundaries.

But I believe the problem is broader. The real issue is not the absence of a domain model — it is the absence of **explicit shapes**. That is a similar problem, but not limited to the domain layer.

## Shape-Driven Design

Every architectural boundary has data crossing it.

- External APIs
- CMS responses
- Database records
- Cache entries
- View models

These are not necessarily domain entities, but they are still shapes.

For example:

```text
External API
↓
Raw API Shape

Infrastructure
↓
Domain Shape

Application
↓
View Shape
```

Each layer speaks a different language. Each layer has different concerns. Each layer deserves its own explicit representation. The domain is often the most stable layer, but it is not the only layer that benefits from modeling.

Infrastructure has shapes.

Use cases and their inputs and outputs have shapes.

Views have shapes.

Whenever data crosses a boundary, there should be a recognizable shape on each side.

That idea is close to the [mental model](/v0/getting-started/mental-model/) behind `xndrjs`: external data starts as `unknown`, crosses a validation boundary once, and only then becomes something the rest of the system can treat as trustworthy.

This idea of "Shape-Driven Design" generalizes that instinct beyond any single library — to every layer where a contract exists but nobody named it.

## The boundary principle

A useful rule of thumb is:

> The further data travels from a boundary, the less parsing should exist.

Good:

```text
API
↓
Schema
↓
Domain Model
↓
Use Cases
```

Bad:

```text
API
↓
unknown
↓
typeof
↓
Array.isArray
↓
isRecord
↓
???
```

Parsing belongs at boundaries.

When parsing starts appearing throughout the system, it is often a sign that a shape was never properly defined.

## Recognizing parsing-slop

There is no objective metric. And the presence of a few runtime checks is not inherently bad.

However, parsing-slop often leaves traces.

You may notice:

- repeated `isRecord()` helpers
- repeated `typeof` checks
- repeated `Array.isArray()` checks
- widespread use of `unknown`, or `as` type assertions that skip establishing it
- giant parsing functions, often scattered across many files and layers
- parsers that handle multiple unrelated payloads

In theory, none of these is wrong in itself — each can be justified in isolation.

The smell appears when they become the primary way contracts are expressed.

## What to do instead

The fix is not "never use `typeof`". It is **"name the shape once at the boundary, then stop parsing"**.

### Name transport shapes at the edge

When the contract comes from an external system, do not let every consumer rediscover it.

- **Contentful** — [`@xndrjs/contentful-to-zod`](/v0/infrastructure/contentful-to-zod/) generates separate transport and flat schemas from your content model, including the single-locale vs multi-locale split from earlier. Parse with `BlogPostEntrySchema`, flatten with the generated helper, and move on. The [Contentful codegen post](/blog/generating-zod-schemas-from-contentful/) walks through the full pattern.
- **OpenAPI / JSON Schema** — [`@xndrjs/domain-ajv`](/v0/adapters/ajv/) fits ingress boundaries where the contract is already JSON Schema. The [OAS walkthrough](/blog/oas-jsonschema-ajv-domain/) shows compile-once validation without hand-written parsers.
- **Everything else at the boundary** — pick the adapter that matches the tool already at that edge: [`@xndrjs/domain-zod`](/v0/adapters/zod/) or [`@xndrjs/domain-valibot`](/v0/adapters/valibot/). Not because one engine wins everywhere, but because the schema should **exist once** and live next to the boundary it protects.

The adapter is a doorway, not the model. What matters is that `unknown` becomes a **named shape** before it travels inward.

### Model the shapes your application actually uses

Inside the boundary, use [`@xndrjs/domain`](/v0/domain/overview/) for trusted representations:

- **`primitive`** for semantic scalars (`Email`, `Slug`, `UserId`)
- **`shape`** for immutable object representations (`Article`, `Order`)
- **`capability`** for named transitions instead of mutating parsed blobs
- **`proof`** when a workflow needs a stronger guarantee than the base shape already carries

Call `create` or `safeCreate` when data crosses in. After that, use cases should receive `Article`, not `unknown` with another round of `isRecord`.

### Map explicitly between layers

```text
Contentful transport schema
  → flatten / normalize
  → domain shape (Article)
  → view shape (ArticleSummary)
```

Each arrow is a named transformation between named shapes — not a `typeof` branch inside a component.

### Define shapes before behavior

Make shape modeling an **explicit step** in your workflow — not something you hope will emerge from the implementation.

Through skills, rules, or deliberate prompts, make your AI assistant name the shapes at every boundary and agree on the [mental model](/v0/getting-started/mental-model/) **before** it writes handlers, use cases, or components. Do not let it produce behavioral code while contracts are still implicit. When that order is reversed, parsing-slop happens: orchestration code fills up with inline `typeof` checks and ad hoc guards instead of calling named shapes. You end up working at the wrong level of abstraction because of a foggy mental model.

## Parse once, name things, move on

Every system needs parsing: that's not the problem. The problem begins when the same structure is rediscovered over and over again instead of being given a name.

Domain-Driven Design helps. Schema validation helps. But underneath these techniques lies a more general principle:

> Every architectural boundary deserves an explicit shape.

Parsing-slop emerges when a boundary exists but no shape exists to represent it.

And once that happens, the missing shape doesn't disappear, it simply reappears everywhere else in the codebase... one `typeof` at a time.
