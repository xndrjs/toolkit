import type { FileMode } from "../../architecture/artifacts";
import type { Diagnostic } from "../../inventory/derive-desired-inventory";

/** Staging directory for crossed-path moves; relative to the materialization root. */
export const MOVE_TEMP_ROOT = ".struttura-tmp";

export type PlanOp =
  | {
      readonly type: "mkdir";
      readonly path: string;
      readonly instanceId: string;
      readonly artifactKey: string;
    }
  | {
      readonly type: "write";
      readonly path: string;
      readonly content: string;
      readonly instanceId: string;
      readonly artifactKey: string;
      readonly mode: FileMode;
    }
  | {
      /** Remove a previously managed artifact that is no longer desired (analysis §14). */
      readonly type: "delete";
      readonly path: string;
      readonly kind: "file" | "directory";
      readonly instanceId: string;
      readonly artifactKey: string;
    }
  | {
      /**
       * Relocate a managed artifact that kept its identity (analysis §13, ADR 0007).
       * Directory moves relocate the full tree, including untracked files.
       */
      readonly type: "move";
      readonly from: string;
      readonly to: string;
      readonly kind: "file" | "directory";
      readonly instanceId: string;
      readonly artifactKey: string;
    };

export type PlanResult =
  | { readonly ok: true; readonly ops: readonly PlanOp[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export type PlannedMove = {
  identity: string;
  from: string;
  to: string;
  kind: "file" | "directory";
  instanceId: string;
  artifactKey: string;
};

export function moveTempPath(identity: string): string {
  return `${MOVE_TEMP_ROOT}/${identity.replace(/::/g, "__")}`;
}
