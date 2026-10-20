# 02 — Apply on empty materialization root + success manifest

**Status:** done  
**Blocked by:** 01

## Delivers

Reconcile creates under the configured materialization root; write last-successful manifest under `architecture/.struttura/`; second apply is a no-op when inputs/state match.

## Done when

Empty root materializes; manifest records instances/artifacts; re-apply drifts nothing.

## Refs

ADRs 0005, 0006
