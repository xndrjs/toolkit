import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { domain, pipe, zodToValidator } from "./index";

/**
 * Mirrors branded `Shape.extend` / `Kit.extend` using **Zod** `baseSchema.extend({ ... })`:
 * two domain shapes, same `fromZod` pattern, no library `.extend()` API.
 */
describe("Zod schema.extend → base + detail shapes", () => {
  const ProfileSchema = z.object({
    type: z.literal("Profile").default("Profile"),
    displayName: z.string().min(1),
  });

  const ProfileDetailSchema = ProfileSchema.extend({
    avatarSrc: z.string().url(),
  });

  const ProfileShape = domain.shape("Profile", zodToValidator(ProfileSchema));
  const ProfileDetailShape = domain.shape("ProfileDetail", zodToValidator(ProfileDetailSchema));

  it("detail kit reuses base Zod via .extend(); zodSchema on both kits", () => {
    expect(ProfileShape.type).toBe("Profile");
    expect(ProfileDetailShape.type).toBe("ProfileDetail");

    const base = ProfileShape.create({ displayName: "Alice" });
    const detail = ProfileDetailShape.create({
      displayName: "Bob",
      avatarSrc: "https://cdn.example/avatar.png",
    });

    expect(ProfileShape.is(base)).toBe(true);
    expect(ProfileDetailShape.is(detail)).toBe(true);
    expect(ProfileDetailShape.is(base)).toBe(false);
  });

  it("project strips to base boundary via target create (extended → base)", () => {
    const detail = ProfileDetailShape.create({
      displayName: "Carl",
      avatarSrc: "https://cdn.example/c.png",
    });

    const projected = ProfileDetailShape.project(detail, ProfileShape);

    expect(projected.displayName).toBe("Carl");
    expect(ProfileShape.is(projected)).toBe(true);
    expect(ProfileDetailShape.is(projected)).toBe(false);
    expect("avatarSrc" in projected).toBe(false);
  });

  it("reusable capability attaches to base and to detail shape (Zod-extended row)", () => {
    const RenameCapability = domain.capabilities<{ displayName: string }>().methods((patch) => ({
      rename(entity, displayName: string) {
        return patch(entity, { displayName });
      },
    }));

    const BaseKit = RenameCapability.attach(ProfileShape);
    const DetailKit = RenameCapability.attach(ProfileDetailShape);

    const user = BaseKit.create({ displayName: "U" });
    const d = DetailKit.create({
      displayName: "D",
      avatarSrc: "https://cdn.example/a.png",
    });

    const ru = BaseKit.rename(user, "U2");
    const rd = DetailKit.rename(d, "D2");

    expect(ru.displayName).toBe("U2");
    expect(BaseKit.is(ru)).toBe(true);

    expect(rd.displayName).toBe("D2");
    expect(rd.avatarSrc).toBe("https://cdn.example/a.png");
    expect(DetailKit.is(rd)).toBe(true);
  });

  it("pipe: detail create → project to base → capability on base kit", () => {
    const RenameCapability = domain.capabilities<{ displayName: string }>().methods((patch) => ({
      rename(entity, displayName: string) {
        return patch(entity, { displayName });
      },
    }));
    const BaseKit = RenameCapability.attach(ProfileShape);

    const out = pipe(
      ProfileDetailShape.create({
        displayName: "In",
        avatarSrc: "https://cdn.example/i.png",
      }),
      (row) => ProfileDetailShape.project(row, ProfileShape),
      (base) => BaseKit.rename(base, "Out")
    );

    expect(out.displayName).toBe("Out");
    expect(ProfileShape.is(out)).toBe(true);
    expectTypeOf(out).toEqualTypeOf<ReturnType<typeof ProfileShape.create>>();
  });
});

describe("Zod extend: attach enforces structural compatibility", () => {
  it("type error when capability requires fields missing on extended Zod row", () => {
    const AnonymousSchema = z.object({
      type: z.literal("Anonymous").default("Anonymous"),
      nickname: z.string(),
    });

    const RenameCapability = domain.capabilities<{ displayName: string }>().methods((patch) => ({
      rename<T extends { displayName: string }>(entity: T, displayName: string) {
        return patch(entity, { displayName });
      },
    }));

    const AnonymousShape = domain.shape("Anonymous", zodToValidator(AnonymousSchema));

    // @ts-expect-error -- row has `nickname`, not `displayName`
    const _invalidAttach = RenameCapability.attach(AnonymousShape);
    expect(_invalidAttach).toBeDefined();
  });
});
