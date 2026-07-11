import { describe, expect, it } from "vitest";
import {
  formatLocaleDeliveryAreaBlock,
  getDeliveryAreaNames,
  getDeliveryArtifactsIssues,
  getDeliveryArtifactsPartitionIssues,
  getDeliveryArtifactsStructureIssues,
  getLocaleDeliveryAreaMap,
} from "./delivery-artifacts.js";

describe("delivery-artifacts", () => {
  const validArtifacts = {
    eu: ["it", "fr"],
    us: ["en-US"],
  };

  it("accepts a valid structure", () => {
    expect(getDeliveryArtifactsStructureIssues(validArtifacts)).toEqual([]);
  });

  it("rejects invalid area names", () => {
    const issues = getDeliveryArtifactsStructureIssues({
      "1eu": ["it"],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('Invalid delivery area name "1eu"');
  });

  it("rejects empty area locale lists", () => {
    const issues = getDeliveryArtifactsStructureIssues({
      eu: [],
      us: ["en-US"],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('Delivery area "eu" must include at least one locale');
  });

  it("rejects duplicate locales across areas", () => {
    const issues = getDeliveryArtifactsStructureIssues({
      eu: ["it", "fr"],
      us: ["fr", "en-US"],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('Locale "fr" appears in both "eu" and "us"');
  });

  it("requires an exhaustive partition of request locales", () => {
    const requestLocales = new Set(["it", "fr", "en-US"]);

    expect(getDeliveryArtifactsPartitionIssues(validArtifacts, requestLocales)).toEqual([]);
  });

  it("reports missing request locales", () => {
    const issues = getDeliveryArtifactsPartitionIssues(
      { eu: ["it"] },
      new Set(["it", "fr", "en-US"])
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("missing locales");
    expect(issues[0]?.message).toContain("fr");
    expect(issues[0]?.message).toContain("en-US");
  });

  it("reports excess locales not in request set", () => {
    const issues = getDeliveryArtifactsPartitionIssues(validArtifacts, new Set(["it"]));

    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("includes locales not required");
    expect(issues[0]?.message).toContain("fr");
    expect(issues[0]?.message).toContain("en-US");
  });

  it("getDeliveryArtifactsIssues merges structure and partition errors", () => {
    const issues = getDeliveryArtifactsIssues(
      {
        eu: [],
        "1bad": ["it"],
        us: ["it"],
      },
      new Set(["it", "en-US"])
    );

    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Delivery area "eu" must include at least one locale'),
        expect.stringContaining('Invalid delivery area name "1bad"'),
        expect.stringContaining('Locale "it" appears in both "1bad" and "us"'),
        expect.stringContaining("missing locales"),
        expect.stringContaining("en-US"),
      ])
    );
  });

  it("returns sorted delivery area names", () => {
    expect(
      getDeliveryAreaNames({
        us: ["en-US"],
        eu: ["it", "fr"],
      })
    ).toEqual(["eu", "us"]);
  });

  it("builds locale to delivery area map", () => {
    expect(
      getLocaleDeliveryAreaMap({
        amer: ["en-US", "es-AR"],
        eu: ["en", "it", "fr", "es"],
      })
    ).toEqual({
      en: "eu",
      "en-US": "amer",
      "es-AR": "amer",
      es: "eu",
      fr: "eu",
      it: "eu",
    });
  });

  it("formats locale delivery area block for generated types", () => {
    expect(
      formatLocaleDeliveryAreaBlock(
        {
          eu: ["it", "fr"],
          us: ["en-US"],
        },
        "LOCALE_DELIVERY_AREA",
        "AppLocale",
        "AppDeliveryArea"
      )
    ).toBe(
      "export const LOCALE_DELIVERY_AREA = {\n" +
        '  "en-US": "us",\n' +
        '  "fr": "eu",\n' +
        '  "it": "eu",\n' +
        "} as const satisfies Record<AppLocale, AppDeliveryArea>;\n\n"
    );
  });
});
