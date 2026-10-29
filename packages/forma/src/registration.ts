import type { AnyProvider, IntentAlias } from "./alias-intent.js";
import { intentLabel, intentMapKey } from "./intent-keys.js";

/**
 * Fail loud on duplicate / ambiguous registration (compile-time may not catch these yet).
 * Same structured identity `(boundaryId, intentName)` coalesces across declarations.
 */
export function assertRegistrationSafety(
  surfaceProviders: readonly AnyProvider[],
  privateProviders: readonly AnyProvider[],
  aliases: readonly IntentAlias[]
): void {
  const surfaceIds = new Set<string>();
  for (const provider of surfaceProviders) {
    const id = intentMapKey(provider.intent);
    if (surfaceIds.has(id)) {
      throw new Error(
        `Intent ${intentLabel(provider.intent)} is registered more than once in surface`
      );
    }
    surfaceIds.add(id);
  }

  const privateIds = new Set<string>();
  for (const provider of privateProviders) {
    const id = intentMapKey(provider.intent);
    if (surfaceIds.has(id)) {
      throw new Error(`Intent ${intentLabel(provider.intent)} appears in both surface and wiring`);
    }
    if (privateIds.has(id)) {
      throw new Error(
        `Intent ${intentLabel(provider.intent)} is registered more than once in wiring`
      );
    }
    privateIds.add(id);
  }

  const registeredIds = new Set<string>([...surfaceIds, ...privateIds]);
  const aliasedRequiredIds = new Set<string>();
  for (const [required] of aliases) {
    const requiredId = intentMapKey(required);
    if (registeredIds.has(requiredId)) {
      throw new Error(
        `Ambiguous satisfaction for Intent ${intentLabel(required)}: both a provider and an intent alias are registered`
      );
    }
    if (aliasedRequiredIds.has(requiredId)) {
      throw new Error(`Duplicate intent alias for Intent ${intentLabel(required)}`);
    }
    aliasedRequiredIds.add(requiredId);
  }
}

/** Build Intent-identity registry and alias rewrite map after safety checks. */
export function buildRegistry(
  surfaceProviders: readonly AnyProvider[],
  privateProviders: readonly AnyProvider[],
  aliases: readonly IntentAlias[]
): {
  registry: Map<string, AnyProvider>;
  aliasMap: Map<string, string>;
} {
  const registry = new Map<string, AnyProvider>();
  for (const provider of [...surfaceProviders, ...privateProviders]) {
    registry.set(intentMapKey(provider.intent), provider);
  }

  /** Required Intent identity key → satisfier Intent identity key. */
  const aliasMap = new Map<string, string>();
  for (const [required, satisfier] of aliases) {
    aliasMap.set(intentMapKey(required), intentMapKey(satisfier));
  }

  return { registry, aliasMap };
}
