import { describe, expect, it } from "vitest";
import {
  defaultReactBindingsOutput,
  defaultReactConfigPath,
  resolveReactBindingsOutputPath,
} from "./react-codegen-config.js";

describe("react-codegen-config", () => {
  it("defaults output next to instanceOutput", () => {
    expect(defaultReactBindingsOutput("generated/instance.generated.ts")).toBe(
      "generated/react-bindings.generated.tsx"
    );
  });

  it("prefers --out over react config and default", () => {
    expect(
      resolveReactBindingsOutputPath({
        instanceOutput: "generated/instance.generated.ts",
        cliOut: "custom/bindings.tsx",
        reactConfig: { output: "ignored.tsx" },
      })
    ).toBe("custom/bindings.tsx");
  });

  it("uses react config output when --out is omitted", () => {
    expect(
      resolveReactBindingsOutputPath({
        instanceOutput: "generated/instance.generated.ts",
        reactConfig: { output: "generated/custom-react.tsx" },
      })
    ).toBe("generated/custom-react.tsx");
  });

  it("derives default react config path from i18n.codegen.json", () => {
    expect(defaultReactConfigPath("/app/i18n/i18n.codegen.json")).toBe(
      "/app/i18n/i18n-react.codegen.json"
    );
  });
});
