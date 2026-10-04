import { describe, expect, it } from "vitest";

import { Scalars } from "../generated/resources";
import { DEMO_LOCALE, demoIds } from "../infrastructure/fixtures/cms-store.js";
import { ERROR_HANDLING_CASES } from "./error-handling-cases.js";
import { isErrorHandlingCaseId, resolveErrorHandling } from "./resolve-error-handling.js";

describe("resolveErrorHandling", () => {
  it("exposes all six showcase case ids", () => {
    expect(ERROR_HANDLING_CASES).toHaveLength(6);
    for (const c of ERROR_HANDLING_CASES) {
      expect(isErrorHandlingCaseId(c.id)).toBe(true);
    }
  });

  it("soft-fails a missing single expand with set null", async () => {
    const { errorHandlingDetail, errors } = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehSoftSingle),
      locale: DEMO_LOCALE,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errorHandlingDetail.softSingle).toBeNull();
    expect(errorHandlingDetail.errorSingle).toMatchObject({ kind: "Hero", title: "Welcome" });
  });

  it("soft-fails a missing single expand with set error", async () => {
    const { errorHandlingDetail, errors } = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehErrorSingle),
      locale: DEMO_LOCALE,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errorHandlingDetail.errorSingle).toEqual(
      expect.objectContaining({
        kind: "ResolutionError",
        code: "missing",
        message: expect.any(String),
        resourceKey: expect.any(String),
      })
    );
    expect(errorHandlingDetail.errorSingle).not.toBeInstanceOf(Error);
    expect(errorHandlingDetail.softSingle).toMatchObject({ kind: "Hero", title: "Welcome" });
  });

  it("hard-fails a missing single expand with throw", async () => {
    await expect(
      resolveErrorHandling({
        labId: Scalars.EntryId(demoIds.ehThrowSingle),
        locale: DEMO_LOCALE,
      })
    ).rejects.toThrow();
  });

  it("soft-fails a missing array item with set null (keeps the ok sibling)", async () => {
    const { errorHandlingDetail, errors } = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehSoftItems),
      locale: DEMO_LOCALE,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errorHandlingDetail.softItems).toHaveLength(2);
    expect(errorHandlingDetail.softItems[0]).toMatchObject({ kind: "Hero", title: "Welcome" });
    expect(errorHandlingDetail.softItems[1]).toBeNull();
  });

  it("soft-fails a missing array item with set error (keeps the ok sibling)", async () => {
    const { errorHandlingDetail, errors } = await resolveErrorHandling({
      labId: Scalars.EntryId(demoIds.ehErrorItems),
      locale: DEMO_LOCALE,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errorHandlingDetail.errorItems).toHaveLength(2);
    expect(errorHandlingDetail.errorItems[0]).toMatchObject({ kind: "Hero", title: "Welcome" });
    expect(errorHandlingDetail.errorItems[1]).toEqual(
      expect.objectContaining({
        kind: "ResolutionError",
        code: "missing",
        message: expect.any(String),
        resourceKey: expect.any(String),
      })
    );
    expect(errorHandlingDetail.errorItems[1]).not.toBeInstanceOf(Error);
  });

  it("hard-fails a missing array item with throw", async () => {
    await expect(
      resolveErrorHandling({
        labId: Scalars.EntryId(demoIds.ehThrowItems),
        locale: DEMO_LOCALE,
      })
    ).rejects.toThrow();
  });
});
