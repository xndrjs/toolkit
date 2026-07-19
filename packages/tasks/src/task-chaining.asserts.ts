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

  task(async () => 1)
    .retry(() => true)
    // @ts-expect-error — at most one .retry()
    .retry(() => true);

  task(async () => 1)
    .inflightDedup(k)
    // @ts-expect-error — use .retry before .inflightDedup when you need both
    .retry(() => true);

  task(async () => 1)
    .inflightDedup(k)
    // @ts-expect-error — at most one .inflightDedup()
    .inflightDedup(k);

  task(async () => 1)
    .retry(() => true)
    .inflightDedup(k)
    // @ts-expect-error — `TaskFinal` has no `.retry()`
    .retry(() => true);
}
