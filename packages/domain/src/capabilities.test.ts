import { describe, expect, it } from "vitest";

import type { Mutable } from "./branded";
import { capabilities } from "./capabilities";
import { DomainValidationError } from "./errors";
import { shape } from "./shape";
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
      const row = input as Record<string, unknown>;
      const { displayName, type: typeIn } = row;
      if (typeof displayName !== "string" || displayName.length === 0) {
        return fail("Invalid displayName");
      }
      const type = typeof typeIn === "string" ? typeIn : "Profile";
      if (type !== "Profile") {
        return fail("Invalid type");
      }
      return { success: true, data: { type: "Profile", displayName } };
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
      const row = input as Record<string, unknown>;
      const { name, type: typeIn } = row;
      if (typeof name !== "string") {
        return fail("Invalid name");
      }
      const type = typeof typeIn === "string" ? typeIn : "Widget";
      if (type !== "Widget") {
        return fail("Invalid type");
      }
      return { success: true, data: { type: "Widget", name } };
    },
  };
}

function anonymousValidator(): Validator<
  { nickname: string; type?: string },
  { type: string; nickname: string }
> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const row = input as Record<string, unknown>;
      const { nickname, type: typeIn } = row;
      if (typeof nickname !== "string") {
        return fail("Invalid nickname");
      }
      const type = typeof typeIn === "string" ? typeIn : "Anonymous";
      if (type !== "Anonymous") {
        return fail("Invalid type");
      }
      return { success: true, data: { type: "Anonymous", nickname } };
    },
  };
}

function profileDetailValidator(): Validator<
  { displayName: string; avatarSrc: string; type?: string },
  { type: string; displayName: string; avatarSrc: string }
> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const row = input as Record<string, unknown>;
      const { displayName, avatarSrc, type: typeIn } = row;
      if (typeof displayName !== "string" || displayName.length === 0) {
        return fail("Invalid displayName");
      }
      if (typeof avatarSrc !== "string" || avatarSrc.length === 0) {
        return fail("Invalid avatarSrc");
      }
      const type = typeof typeIn === "string" ? typeIn : "ProfileDetail";
      if (type !== "ProfileDetail") {
        return fail("Invalid type");
      }
      return {
        success: true,
        data: { type: "ProfileDetail", displayName, avatarSrc },
      };
    },
  };
}

describe("capabilities", () => {
  const ProfileShape = shape("Profile", profileValidator());

  const ProfileKit = capabilities
    .forShape<{ displayName: string }>()
    .methods(({ patch }) => ({
      rename(profile, displayName: string) {
        return patch(profile, { displayName });
      },
    }))
    .attach(ProfileShape);

  it("attach exposes custom methods only; instances stay data-only", () => {
    const p = ProfileShape.create({ displayName: "Alice" });
    const next = ProfileKit.rename(p, "Bob");
    expect(next.displayName).toBe("Bob");
    expect(ProfileShape.is(next)).toBe(true);
    expect(Object.keys(next as object)).not.toContain("rename");
    expect(JSON.stringify(next)).not.toContain("rename");
    expect(ProfileKit).not.toHaveProperty("create");
    expect(ProfileKit).not.toHaveProperty("is");
  });

  it("patch re-validates; invalid delta throws", () => {
    const p = ProfileShape.create({ displayName: "ok" });
    expect(() => ProfileKit.rename(p, "")).toThrow(DomainValidationError);
  });

  it("allows capability method names that match schema kit helpers", () => {
    const WithCreate = capabilities
      .forShape<{ displayName: string }>()
      .methods(({ patch }) => ({
        create(profile, displayName: string) {
          return patch(profile, { displayName });
        },
      }))
      .attach(ProfileShape);

    const p = ProfileShape.create({ displayName: "Alice" });
    expect(WithCreate.create(p, "Bob").displayName).toBe("Bob");
  });

  it("patch with callback draft rejects invalid discriminant", () => {
    const WidgetShape = shape("Widget", widgetValidator());
    const WidgetKit = capabilities
      .forShape<{ name: string }>()
      .methods(({ patch }) => ({
        applyDraft(w, fn: (draft: Mutable<{ type?: string; name: string }>) => void) {
          return patch(w, fn);
        },
      }))
      .attach(WidgetShape);

    const w = WidgetShape.create({ name: "a" });
    expect(() =>
      WidgetKit.applyDraft(w, (draft) => {
        draft.name = "b";
        (draft as { type?: string }).type = "Evil";
      })
    ).toThrow(DomainValidationError);
    const ok = WidgetShape.create({ name: "c" });
    const next = WidgetKit.applyDraft(ok, (d) => {
      d.name = "d";
    });
    expect(next.name).toBe("d");
    expect(next.type).toBe("Widget");
  });

  it("reusable capability can attach to the same shape again with identical kit shape", () => {
    const Rename = capabilities.forShape<{ displayName: string }>().methods(({ patch }) => ({
      rename(entity, displayName: string) {
        return patch(entity, { displayName });
      },
    }));

    const KitA = Rename.attach(ProfileShape);
    const KitB = Rename.attach(ProfileShape);
    const p = ProfileShape.create({ displayName: "A" });
    expect(KitB.rename(p, "B").displayName).toBe("B");
    expect(ProfileShape.is(KitA.rename(p, "B"))).toBe(true);
  });

  it("reusable capability can attach to base and detail shapes", () => {
    const RenameCapability = capabilities
      .forShape<{ displayName: string }>()
      .methods(({ patch }) => ({
        rename(entity, displayName: string) {
          return patch(entity, { displayName });
        },
      }));

    const BaseProfileShape = shape("Profile", profileValidator());
    const DetailProfileShape = shape("ProfileDetail", profileDetailValidator());

    const UserRenamingKit = RenameCapability.attach(BaseProfileShape);
    const UserDetailRenamingKit = RenameCapability.attach(DetailProfileShape);

    const user = BaseProfileShape.create({
      displayName: "Initial User Name",
    });
    const detail = DetailProfileShape.create({
      displayName: "Initial Detail Name",
      avatarSrc: "https://cdn.local/avatar.png",
    });

    const renamedUser = UserRenamingKit.rename(user, "User Name");
    const renamedDetail = UserDetailRenamingKit.rename(detail, "Detail Name");

    expect(renamedUser.displayName).toBe("User Name");
    expect(BaseProfileShape.is(renamedUser)).toBe(true);

    expect(renamedDetail.displayName).toBe("Detail Name");
    expect(renamedDetail.avatarSrc).toBe("https://cdn.local/avatar.png");
    expect(DetailProfileShape.is(renamedDetail)).toBe(true);
  });

  it("attach enforces structural compatibility at type level", () => {
    const RenameCapability = capabilities
      .forShape<{ displayName: string }>()
      .methods(({ patch }) => ({
        rename<T extends { displayName: string }>(entity: T, displayName: string) {
          return patch(entity, { displayName });
        },
      }));

    const AnonymousShape = shape("Anonymous", anonymousValidator());

    // @ts-expect-error -- instance row lacks `displayName`
    const _invalidAttach = RenameCapability.attach(AnonymousShape);
    expect(_invalidAttach).toBeDefined();
  });
});
