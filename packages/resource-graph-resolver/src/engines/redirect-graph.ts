import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import { ResourceGraphError, ResourceRedirectCycleError } from "../errors";
import type { ResourceKey } from "../types";

/**
 * Per-resolution redirect graph.
 *
 * Direct edges are retained for cheap linking and reverse traversal. Canonical
 * lookups compress traversed paths, while reverse adjacency lets payloads and
 * failures reach only aliases affected by a settled target.
 */
export class RedirectGraph {
  private readonly targetByAlias = new Map<ResourceKey, ApplicationResourceIdentifier>();
  private readonly aliasesByTarget = new Map<ResourceKey, Set<ResourceKey>>();
  private readonly resourcesByKey = new Map<ResourceKey, ApplicationResourceIdentifier>();

  /** Link one locator to a target and return the final canonical target. */
  link(
    locator: ApplicationResourceIdentifier,
    target: ApplicationResourceIdentifier
  ): ApplicationResourceIdentifier {
    const locatorKey = this.remember(locator);
    const targetKey = this.remember(target);
    const existing = this.targetByAlias.get(locatorKey);

    if (existing !== undefined) {
      const existingCanonical = this.canonicalOf(existing);
      const requestedCanonical = this.canonicalOf(target);
      if (existingCanonical.toString() !== requestedCanonical.toString()) {
        throw new ResourceGraphError(
          `Conflicting resource redirect for ${locatorKey}: ${existingCanonical.toString()} vs ${requestedCanonical.toString()}`
        );
      }
      return existingCanonical;
    }

    const path = this.pathFrom(target);
    const cycleStart = path.findIndex((resource) => resource.toString() === locatorKey);
    if (locatorKey === targetKey || cycleStart >= 0) {
      const cycle =
        locatorKey === targetKey
          ? [locatorKey, locatorKey]
          : [locatorKey, ...path.slice(0, cycleStart + 1).map((resource) => resource.toString())];
      throw new ResourceRedirectCycleError(cycle);
    }

    this.targetByAlias.set(locatorKey, target);
    this.addReverseEdge(targetKey, locatorKey);
    return this.canonicalOf(target);
  }

  /** Canonical target when `resource` is an alias; otherwise `undefined`. */
  redirectOf(resource: ApplicationResourceIdentifier): ApplicationResourceIdentifier | undefined {
    const key = this.remember(resource);
    return this.targetByAlias.has(key) ? this.canonicalOf(resource) : undefined;
  }

  /** Resolve the final target and compress every traversed alias edge. */
  canonicalOf(resource: ApplicationResourceIdentifier): ApplicationResourceIdentifier {
    this.remember(resource);
    const path = this.pathFrom(resource);
    const canonical = path.at(-1)!;
    const canonicalKey = canonical.toString();

    for (const alias of path.slice(0, -1)) {
      const aliasKey = alias.toString();
      const previousTarget = this.targetByAlias.get(aliasKey);
      if (previousTarget === undefined || previousTarget.toString() === canonicalKey) continue;

      this.aliasesByTarget.get(previousTarget.toString())?.delete(aliasKey);
      this.targetByAlias.set(aliasKey, canonical);
      this.addReverseEdge(canonicalKey, aliasKey);
    }

    return canonical;
  }

  /** Every direct or transitive alias of `resource`'s canonical identity. */
  aliasesOf(resource: ApplicationResourceIdentifier): readonly ResourceKey[] {
    const canonical = this.canonicalOf(resource);
    return this.aliasesOfKey(canonical.toString());
  }

  /** Every alias of a canonical key, in deterministic order. */
  aliasesOfKey(resourceKey: ResourceKey): readonly ResourceKey[] {
    const aliases = new Set<ResourceKey>();
    const pending = [resourceKey];

    while (pending.length > 0) {
      const targetKey = pending.pop()!;
      for (const aliasKey of this.aliasesByTarget.get(targetKey) ?? []) {
        if (aliases.has(aliasKey)) continue;
        aliases.add(aliasKey);
        pending.push(aliasKey);
      }
    }

    aliases.delete(resourceKey);
    return [...aliases].sort();
  }

  /** Flattened alias → canonical target snapshot for resolver consumers. */
  snapshot(): ReadonlyMap<ResourceKey, ApplicationResourceIdentifier> {
    const redirects = new Map<ResourceKey, ApplicationResourceIdentifier>();
    for (const aliasKey of [...this.targetByAlias.keys()].sort()) {
      const alias = this.resourcesByKey.get(aliasKey)!;
      redirects.set(aliasKey, this.canonicalOf(alias));
    }
    return redirects;
  }

  private pathFrom(resource: ApplicationResourceIdentifier): ApplicationResourceIdentifier[] {
    const path = [resource];
    let current = resource;

    while (true) {
      const target = this.targetByAlias.get(current.toString());
      if (target === undefined) return path;
      path.push(target);
      current = target;
    }
  }

  private remember(resource: ApplicationResourceIdentifier): ResourceKey {
    const key = resource.toString();
    this.resourcesByKey.set(key, resource);
    return key;
  }

  private addReverseEdge(targetKey: ResourceKey, aliasKey: ResourceKey): void {
    const aliases = this.aliasesByTarget.get(targetKey) ?? new Set<ResourceKey>();
    aliases.add(aliasKey);
    this.aliasesByTarget.set(targetKey, aliases);
  }
}
