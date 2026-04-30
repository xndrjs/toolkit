import { describe, expect, it } from "vitest";

import {
  createAjvDomainAdapter,
  openApiComponentToValidator,
  jsonSchemaToValidator,
} from "./index";

describe("jsonSchemaToValidator", () => {
  it("returns success for valid payload", () => {
    const validator = jsonSchemaToValidator<{ email: string }>({
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string", format: "email" },
      },
      additionalProperties: false,
    });

    const result = validator.validate({ email: "dev@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("dev@example.com");
    }
  });

  it("maps required field issues to the missing property path", () => {
    const validator = jsonSchemaToValidator<{ email: string }>({
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string", format: "email" },
      },
      additionalProperties: false,
    });

    const result = validator.validate({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.engine).toBe("ajv");
      expect(result.error.issues[0]?.code).toBe("required");
      expect(result.error.issues[0]?.path).toEqual(["email"]);
    }
  });
});

describe("openApiComponentToValidator", () => {
  const bundle = {
    openapi: "3.1.0",
    info: { title: "test", version: "1.0.0" },
    paths: {},
    components: {
      schemas: {
        Tier: {
          type: "string",
          enum: ["free", "pro"],
        },
        User: {
          type: "object",
          required: ["tier"],
          properties: {
            tier: { $ref: "#/components/schemas/Tier" },
          },
        },
      },
    },
  };

  it("validates refs in bundled OpenAPI components", () => {
    const validator = openApiComponentToValidator<{ tier: "free" | "pro" }>(bundle, "User");
    const result = validator.validate({ tier: "pro" });
    expect(result.success).toBe(true);
  });

  it("fails with enum issue for invalid referenced value", () => {
    const validator = openApiComponentToValidator<{ tier: "free" | "pro" }>(bundle, "User");
    const result = validator.validate({ tier: "enterprise" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === "enum")).toBe(true);
    }
  });

  it("creates an isolated adapter instance with custom lifecycle", () => {
    const adapter = createAjvDomainAdapter();
    const tierValidator = adapter.openApiComponentToValidator<"free" | "pro">(bundle, "Tier");
    const ok = tierValidator.validate("free");
    expect(ok.success).toBe(true);
  });
});
