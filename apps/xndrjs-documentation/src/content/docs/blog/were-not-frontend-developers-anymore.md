---
title: 'We''re Not "Frontend Developers" Anymore'
description: Modern frontend work has become system work. Architectural thinking is no longer a specialization, but a necessity for dealing with orchestration, integration, and domain complexity.
date: 2026-07-03
author: Fabio Fognani
tags:
  - architecture
  - front-end
  - ai
---

A few years ago, being a frontend developer was a fairly well-defined job: you fetched data from a backend, rendered components, handled user interactions, and sent data back to the backend. Add a sprinkle of CSS, and that was pretty much it.

Life was relatively simple.

Whenever something became "too complicated", the answer was usually:

> "That belongs in the backend."

Today, that boundary has become increasingly blurry. A modern frontend developer might spend the day working on:

- Server-Side Rendering
- route resolution
- data aggregation across multiple services
- request caching
- integrating with headless CMSs
- payment providers
- feature flags
- webhooks
- server-side business rules
- data migration scripts
- content migration and backup/restore tooling

How much of it still sounds like "just frontend"?

## The frontend didn't change overnight

This didn't happen because React evolved, or because Next.js became popular, or because TypeScript won. It happened because the systems we build changed.

Modern web applications are no longer simple browser clients talking to a single API. They have become the "orchestration layer" of increasingly distributed systems.

A single request may involve multiple APIs, a CMS, authentication providers, payment gateways, feature flag services, search engines, caches, queues and internal backend services.

Whether that orchestration happens inside a traditional backend or inside your frontend runtime — SSR, server components, edge functions, BFFs — ultimately becomes an implementation detail.

The complexity is there.

## We didn't become backend developers

Nonetheless, I don't think frontend developers are becoming backend developers.

I think we're becoming full-fledged **application engineers** who happen to spend most of their time writing TypeScript across different runtimes.

That requires thinking beyond the browser.

It means understanding which parts of our code are genuinely view concerns, which belong to infrastructure, and which express reusable orchestration logic across different runtimes and applications.

As our projects become more complex, we simply can't afford to mix those concerns anymore.

When your code orchestrates multiple systems, questions like these inevitably appear:

- Where should business logic live?
- How do we keep infrastructure details isolated?
- How do we prevent framework-specific concepts from leaking everywhere?
- How do we model data crossing architectural boundaries?
- How do we test orchestration without talking to external services?

Those questions aren't "backend questions."

They're software engineering questions.

### Ok, but is it just (boring) theory?

If these sound like theoretical questions, think again.

At some point, you will be asked to upgrade a framework to its latest major version for security reasons, migrate to a different CMS, or build a new application that shares part of its use cases with an existing one.

In that exact moment, what matters is not how the system was meant to work in theory, but how it was actually structured in practice.

And what you do **not** want is:

- UI components in the existing application also being responsible for business orchestration, making that logic tightly coupled to presentation concerns and difficult to disentangle before reuse
- application components depending directly on CMS-specific types and data shapes, turning a CMS migration into a full rewrite of the UI layer
- core application logic being strongly coupled to frontend framework API, so that a breaking change in the framework forces rewrites in areas that should have remained independent

These are not edge cases. They are the natural outcome of skipping architectural boundaries in favor of short-term simplicity.

And they are exactly the kind of problems system architecture thinking is meant to prevent.

### Why modern frontend work requires system architecture thinking

Modern frontend work increasingly participates in system-level responsibilities: orchestrating requests across multiple services, handling server-side execution, integrating external providers, and shaping how data flows through distributed boundaries.

At that point, the relevant unit of design is no longer the component, or even the application layer. It is the system.

This shift makes it impossible to treat architecture as an optional concern, or as something delegated to “somewhere else in the stack”. Once a frontend codebase becomes a coordination layer across multiple runtimes and services, every decision — data flow, dependency structure, separation of concerns — becomes a system design decision.

System architecture thinking, in this context, is not about adopting a specific set of patterns or imitating backend practices. It is about having the right level of abstraction to reason about **complexity** that already exists.

It's worth repeating: **it already exists**.

The implication is simple: when frontend work becomes system work, system-level thinking stops being optional.

## Architecture is becoming part of developer experience

One consequence of this evolution is often overlooked. Architecture is no longer just about producing "clean code".

It's becoming part of the developer experience itself.

Good architectural boundaries don't just improve maintainability.

They improve **onboarding**.

They make projects easier to **navigate**.

They reduce coupling, hence **cognitive load**.

They make **code generation** more predictable.

They allow **lint rules** to prevent entire classes of mistakes before they happen.

In many ways, architecture is becoming another _developer tool_.

## AI made this impossible to ignore

Large Language Models, and the rise of agentic coding workflows, have made this even more obvious.

When an architecture has explicit boundaries, stable domain and clear responsibilities, AI tends to generate surprisingly coherent and "linear" code.

When everything is mixed together — parsing, infrastructure, business logic and presentation — the result quickly becomes defensive code, duplicated transformations and what I recently started calling [parsing-slop](/blog/parsing-slop-a-particular-form-of-ai-slop/).

AI **didn't create** architectural problems: it simply exposed them.

## Maybe we are using an obsolete name

Perhaps "frontend developer" is no longer the most accurate description of what many of us do.

We’re designing systems. We’re orchestrating infrastructure, modeling domains, and working with business logic.

Sometimes we render HTML.

And maybe that's exactly why ideas like Clean Architecture and [Shape-Driven Design](/blog/object-oriented-modeling-vs-trusted-shape-modeling/) are becoming increasingly relevant in how we write software.

Not because frontend developers suddenly discovered architecture, or because they are imitating backend development.

Because architecture _quietly_ became a necessity, in shaping complex systems.
