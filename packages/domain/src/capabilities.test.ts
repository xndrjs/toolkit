import { describe, expect, it } from "vitest";

import type { Mutable } from "./branded";
import { capabilities } from "./capabilities";
import { DomainValidationError } from "./errors";
import { getShapePatchImpl, shape } from "./shape";
import type { Validator } from "./validation";

function fail(message: string, code = "invalid") {
  return {
    success: false as const,
    error: {
      engine: "test",
      issues: [{ code, path: [] as const, message }],
    },
  };
}

function profileValidator(): Validator<
  { displayName: string; type?: string },
  { type: string; displayName: string }
> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const o = input as Record<string, unknown>;
      if (typeof o.displayName !== "string" || o.displayName.length === 0) {
        return fail("Invalid displayName");
      }
      const type = typeof o.type === "string" ? o.type : "Profile";
      if (type !== "Profile") {
        return fail("Invalid type");
      }
      return { success: true, data: { type: "Profile", displayName: o.displayName } };
    },
  };
}

function widgetValidator(): Validator<
  { type?: string; name: string },
  { type: string; name: string }
> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const o = input as Record<string, unknown>;
      if (typeof o.name !== "string") {
        return fail("Invalid name");
      }
      const type = typeof o.type === "string" ? o.type : "Widget";
      if (type !== "Widget") {
        return fail("Invalid type");
      }
      return { success: true, data: { type: "Widget", name: o.name } };
    },
  };
}

describe("capabilities", () => {
  const ProfileShape = shape("Profile", profileValidator());

  const ProfileKit = capabilities<{ displayName: string }>()
    .methods((patch) => ({
      rename(profile, displayName: string) {
        return patch(profile, { displayName });
      },
    }))
    .attach(ProfileShape);

  it("attach merges methods onto kit; instances stay data-only", () => {
    const p = ProfileKit.create({ displayName: "Alice" });
    const next = ProfileKit.rename(p, "Bob");
    expect(next.displayName).toBe("Bob");
    expect(ProfileKit.is(next)).toBe(true);
    expect(Object.keys(next as object)).not.toContain("rename");
    expect(JSON.stringify(next)).not.toContain("rename");
  });

  it("patch re-validates; invalid delta throws", () => {
    const p = ProfileKit.create({ displayName: "ok" });
    expect(() => ProfileKit.rename(p, "")).toThrow(DomainValidationError);
  });

  it("getShapePatchImpl works on capability kit", () => {
    const patch = getShapePatchImpl(ProfileKit);
    const p = ProfileKit.create({ displayName: "x" });
    const q = patch(p, { displayName: "y" });
    expect(q.displayName).toBe("y");
  });

  it("rejects reserved kit method names", () => {
    expect(() =>
      capabilities<{ displayName: string }>()
        .methods(() => ({
          project() {
            return null;
          },
        }))
        .attach(ProfileShape)
    ).toThrow(TypeError);
  });

  it("patch with callback draft rejects invalid discriminant", () => {
    const WidgetShape = shape("Widget", widgetValidator());
    const WidgetKit = capabilities<{ name: string }>()
      .methods((patch) => ({
        applyDraft(w, fn: (draft: Mutable<{ type?: string; name: string }>) => void) {
          return patch(w, fn);
        },
      }))
      .attach(WidgetShape);

    const w = WidgetKit.create({ name: "a" });
    expect(() =>
      WidgetKit.applyDraft(w, (draft) => {
        draft.name = "b";
        (draft as { type?: string }).type = "Evil";
      })
    ).toThrow(DomainValidationError);
    const ok = WidgetKit.create({ name: "c" });
    const next = WidgetKit.applyDraft(ok, (d) => {
      d.name = "d";
    });
    expect(next.name).toBe("d");
    expect(next.type).toBe("Widget");
  });

  it("reusable capability can attach to the same shape again with identical kit shape", () => {
    const Rename = capabilities<{ displayName: string }>().methods((patch) => ({
      rename(entity: { displayName: string }, displayName: string) {
        return patch(entity, { displayName });
      },
    }));

    const KitA = Rename.attach(ProfileShape);
    const KitB = Rename.attach(ProfileShape);
    const p = KitA.create({ displayName: "A" });
    expect(KitB.rename(p, "B").displayName).toBe("B");
  });
});
