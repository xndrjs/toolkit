import { describe, expect, it } from "vitest";
import { ResolutionError } from "@xndrjs/ziel";

import { Scalars } from "../generated";
import { DEMO_LOCALE, ERROR_HANDLING_CASES, demoIds } from "../infrastructure/fixtures/store.js";
import { isErrorHandlingCaseId, resolveErrorHandling } from "./resolve-error-handling.js";

describe("resolveErrorHandling", () => {
  it("exposes all six showcase case ids", () => {
    expect(ERROR_HANDLING_CASES).toHaveLength(6);
    for (const c of ERROR_HANDLING_CASES) {
      expect(isErrorHandlingCaseId(c.id)).toBe(true);
    }
  });

  it("soft-fails a missing single expand with set null", async () => {
    const result = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehSoftSingle),
      locale: DEMO_LOCALE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.lab.softSingle).toBeNull();
    expect(result.lab.errorSingle).toMatchObject({ kind: "Hero", title: "Welcome" });
  });

  it("soft-fails a missing single expand with set error", async () => {
    const result = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehErrorSingle),
      locale: DEMO_LOCALE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.lab.errorSingle).toBeInstanceOf(ResolutionError);
    expect(result.lab.softSingle).toMatchObject({ kind: "Hero", title: "Welcome" });
  });

  it("hard-fails a missing single expand with throw", async () => {
    const result = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehThrowSingle),
      locale: DEMO_LOCALE,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message.length).toBeGreaterThan(0);
  });

  it("soft-fails a missing array item with set null (keeps the ok sibling)", async () => {
    const result = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehSoftItems),
      locale: DEMO_LOCALE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.lab.softItems).toHaveLength(2);
    expect(result.lab.softItems[0]).toMatchObject({ kind: "Hero", title: "Welcome" });
    expect(result.lab.softItems[1]).toBeNull();
  });

  it("soft-fails a missing array item with set error (keeps the ok sibling)", async () => {
    const result = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehErrorItems),
      locale: DEMO_LOCALE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.lab.errorItems).toHaveLength(2);
    expect(result.lab.errorItems[0]).toMatchObject({ kind: "Hero", title: "Welcome" });
    expect(result.lab.errorItems[1]).toBeInstanceOf(ResolutionError);
  });

  it("hard-fails a missing array item with throw", async () => {
    const result = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehThrowItems),
      locale: DEMO_LOCALE,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
