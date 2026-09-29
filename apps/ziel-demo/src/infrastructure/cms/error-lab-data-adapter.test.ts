import { describe, expect, it } from "vitest";

import { entryAri, errorLabAri, pageAri } from "../../generated";
import { createDemoSources } from "../demo-resolver.js";
import { DEMO_ENVIRONMENT, DEMO_LOCALE, DEMO_SPACE, demoIds } from "../fixtures/store.js";
import { ERROR_LAB_SOURCE_ID, loadErrorLabStore } from "./error-lab-data-adapter.js";

const locale = DEMO_LOCALE;
const spaceId = DEMO_SPACE;
const environmentId = DEMO_ENVIRONMENT;
const loadContext = {
  executionContext: { spaceId, environmentId, locale },
  batchNumber: 1,
};

const labIdentity = (id: string) => ({ spaceId, environmentId, id, locale });

function errorLabSource() {
  return createDemoSources().find((source) => source.id === ERROR_LAB_SOURCE_ID)!;
}

describe("ErrorLabStore datasource", () => {
  it("owns only ErrorLab ARI family", () => {
    const source = errorLabSource();
    expect(source.id).toBe(ERROR_LAB_SOURCE_ID);
    expect(source.for.map((family) => family.type)).toEqual(["ErrorLab"]);
  });

  it("returns positional ErrorLab payload", async () => {
    const load = loadErrorLabStore();
    const lab = errorLabAri(labIdentity(demoIds.ehSoftSingle));

    const payloads = await load([lab], loadContext);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      id: demoIds.ehSoftSingle,
      title: "Soft single (set null)",
    });
  });

  it("returns undefined for unknown lab ids", async () => {
    const load = loadErrorLabStore();
    const lab = errorLabAri(labIdentity("eh-unknown"));
    expect(await load([lab], loadContext)).toEqual([undefined]);
  });

  it("does not serve Page / Entry (CmsEntries owns those)", async () => {
    const load = loadErrorLabStore();
    const page = pageAri(labIdentity(demoIds.page));
    const entry = entryAri(labIdentity(demoIds.heroWelcome));
    expect(await load([page as never, entry as never], loadContext)).toEqual([
      undefined,
      undefined,
    ]);
  });
});
