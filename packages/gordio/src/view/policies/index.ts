import type { ArchitectureViewState } from "../../projection/types";
import { mergeDecorationPatch } from "../state";
import { finalizeVisualDecoration } from "../visual-decoration";
import type {
  ApplyArchitecturePoliciesInput,
  ArchitectureInteraction,
  ArchitecturePolicy,
} from "../types";
import { compositionReachabilityPolicy } from "./composition-reachability";
import { directNeighbourPolicy } from "./direct-neighbours";
import { clearSelectionPolicy, toggleBoxCollapsePolicy } from "./toggle-collapse";

export { compositionReachabilityPolicy } from "./composition-reachability";
export { directNeighbourPolicy } from "./direct-neighbours";
export { clearSelectionPolicy, toggleBoxCollapsePolicy } from "./toggle-collapse";

const defaultPolicies: ArchitecturePolicy[] = [
  compositionReachabilityPolicy,
  toggleBoxCollapsePolicy,
  clearSelectionPolicy,
];

export function resolvePoliciesForEvent(
  event: ArchitectureInteraction,
  policies: ArchitecturePolicy[] = defaultPolicies
): ArchitecturePolicy[] {
  switch (event.type) {
    case "select-node":
      return policies.filter((policy) => policy === directNeighbourPolicy);
    case "select-composition-root":
      return policies.filter((policy) => policy === compositionReachabilityPolicy);
    case "toggle-box-collapse":
      return policies.filter((policy) => policy === toggleBoxCollapsePolicy);
    case "clear-selection":
      return policies.filter((policy) => policy === clearSelectionPolicy);
  }
}

export function applyArchitecturePolicies(
  input: ApplyArchitecturePoliciesInput
): ArchitectureViewState {
  const policies = input.policies ?? defaultPolicies;
  const activePolicies = resolvePoliciesForEvent(input.event, policies);

  const nextState = activePolicies.reduce(
    (viewState, policy) => mergeDecorationPatch(viewState, policy({ ...input, viewState })),
    input.viewState
  );

  return finalizeVisualDecoration(input.graph, nextState);
}
