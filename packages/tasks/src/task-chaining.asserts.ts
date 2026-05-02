import { task } from "./task";

/**
 * Compile-only checks for the allowed `task` fluent shapes. Not meant to run at runtime.
 */
export function assertTaskChainingTypes(): void {
  const k = Symbol("k");

  task(async () => 1);
  task(async () => 1).retry(() => true);
  task(async () => 1).inflightDedup(k);
  task(async () => 1)
    .retry(() => true)
    .inflightDedup(k);

  // @ts-expect-error — at most one .retry()
  task(async () => 1)
    .retry(() => true)
    .retry(() => true);

  // @ts-expect-error — use .retry before .inflightDedup when you need both
  task(async () => 1)
    .inflightDedup(k)
    .retry(() => true);

  // @ts-expect-error — at most one .inflightDedup()
  task(async () => 1)
    .inflightDedup(k)
    .inflightDedup(k);

  task(async () => 1)
    .retry(() => true)
    .inflightDedup(k)
    // @ts-expect-error — `TaskFinal` has no `.retry()`
    .retry(() => true);
}
