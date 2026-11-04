import type { CompositionPlanDescription, IntentIdentity } from "@xndrjs/forma";

/** Display form used by Forma diagnostics: `boundary.intent`. */
function formatIntent(identity: IntentIdentity): string {
  return `${identity[0]}.${identity[1]}`;
}

export function section(title: string): void {
  console.log(`\n── ${title}`);
}

export function printCompositionPlan(title: string, plan: CompositionPlanDescription): void {
  section(title);
  console.log("entryBoundaries:", plan.entryBoundaries);
  console.log(
    "surface:",
    plan.surface.map((entry) => ({
      alias: entry.alias,
      intent: formatIntent(entry.intent),
      origin: entry.origin,
    }))
  );
  console.log(
    "providers:",
    plan.providers.map((provider) => ({
      intent: formatIntent(provider.intent),
      mode: provider.mode,
      origin: provider.origin,
      lifetime: {
        declared: provider.lifetime.declared,
        effective: provider.lifetime.effective,
        ...(provider.lifetime.narrowedBy
          ? { narrowedBy: provider.lifetime.narrowedBy.map(formatIntent).join(" → ") }
          : {}),
      },
    }))
  );
}
