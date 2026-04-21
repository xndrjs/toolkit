import { describe, expect, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import { __brand } from "./private-constants";
import { BrandedType } from "./types";
import { BrandedRefinementError } from "./errors";

const UserSchema = z.object({
  id: z.string(),
  isVerified: z.boolean(),
  additionalData: z.string().optional(),
  avatarSrc: z.string().optional(),
});

const [User, patchUser] = branded.shape("User", UserSchema, {
  methods: {
    canAccessAdminArea() {
      return this.isVerified === true;
    },
    hasAdditionalData() {
      return typeof this.additionalData === "string" && this.additionalData.length > 0;
    },
    profileWordCount() {
      const d = this.additionalData;
      if (typeof d !== "string") return 0;
      return d.trim().split(/\s+/).filter(Boolean).length;
    },
    hasAvatar() {
      return typeof this.avatarSrc === "string" && this.avatarSrc.length > 0;
    },
  },
});

type UserEntity = BrandedType<typeof User>;

/** Narrowed row for verification (type guard target in `when`). */
type VerifiedUserData = UserEntity & { isVerified: true; additionalData: string };

const VerifiedUserRefinement = branded
  .refine(User)
  .when(
    (user): user is VerifiedUserData =>
      user.isVerified === true && typeof user.additionalData === "string"
  )
  .as("VerifiedUser");

/** Domain type after refinement: derived from the kit. */
type VerifiedUser = BrandedType<typeof VerifiedUserRefinement>;

/** Narrowed row for profile enrichment. Second refinement: distinct from {@link VerifiedUserData}. */
type ProfileEnrichedData = UserEntity & { additionalData: string; avatarSrc: string };

const ProfileEnrichedRefinement = branded
  .refine(User)
  .when(
    (user): user is ProfileEnrichedData =>
      typeof user.additionalData === "string" &&
      user.additionalData.length >= 5 &&
      typeof user.avatarSrc === "string" &&
      user.avatarSrc.length > 0
  )
  .as("ProfileEnriched");

/** Profile-enriched user when refining from a plain {@link UserEntity}. */
type ProfileEnrichedUser = BrandedType<typeof ProfileEnrichedRefinement>;

describe("branded refinement", () => {
  it("refinement kit from() return matches VerifiedUser alias", () => {
    const user = User.create({
      id: "u-0",
      isVerified: true,
      additionalData: "x",
    });
    const verified: VerifiedUser = VerifiedUserRefinement.from(user);
    expect(verified.additionalData).toBe("x");
    expect(verified.hasAdditionalData()).toBe(true);
    expect(VerifiedUserRefinement.is(verified)).toBe(true);
  });

  it("brands a valid base shape into a refined branded guarantee", () => {
    const user = User.create({
      id: "u-1",
      isVerified: true,
      additionalData: "present",
    });

    const verified = VerifiedUserRefinement.from(user);
    expect(verified.isVerified).toBe(true);
    expect(verified.canAccessAdminArea()).toBe(true);
    expect(verified.hasAdditionalData()).toBe(true);
    expect(verified.additionalData).toBe("present");
    expect(verified.type).toBe("User");
    expect(verified[__brand]).toEqual({
      User: true,
      VerifiedUser: true,
    });
  });

  it("rejects invalid refinement input via from()", () => {
    const user = User.create({
      id: "u-2",
      isVerified: false,
    });

    expect(() => VerifiedUserRefinement.from(user)).toThrow(BrandedRefinementError);
  });

  it("tryFrom returns null for non-refined values", () => {
    const user = User.create({
      id: "u-3",
      isVerified: true,
    });

    expect(VerifiedUserRefinement.tryFrom(user)).toBeNull();
  });

  it("assert narrows and keeps runtime discriminant", () => {
    const user = User.create({
      id: "u-4",
      isVerified: true,
      additionalData: "ok",
    });

    const verified = VerifiedUserRefinement.from(user);
    expect(verified.type).toBe("User");
    expect(VerifiedUserRefinement.is(verified)).toBe(true);
  });

  it("shape patch preserves refinement brands from the entity", () => {
    const user = User.create({
      id: "u-6",
      isVerified: true,
      additionalData: "before",
    });
    const verified = VerifiedUserRefinement.from(user);
    const next = patchUser(verified, { additionalData: "after" });
    expect(next.additionalData).toBe("after");
    expect(next.canAccessAdminArea()).toBe(true);
    expect(next.hasAdditionalData()).toBe(true);
    expect(next[__brand]).toEqual({
      User: true,
      VerifiedUser: true,
    });
    expect(VerifiedUserRefinement.is(next)).toBe(true);
  });

  it("from() does not mutate the source value and returns a frozen clone", () => {
    const user = User.create({
      id: "u-5",
      isVerified: true,
      additionalData: "ok",
    });

    const beforeBrand = user[__brand];
    const verified = VerifiedUserRefinement.from(user);

    expect(verified).not.toBe(user);
    expect(Object.isFrozen(verified)).toBe(true);
    expect(Object.isFrozen(verified[__brand])).toBe(true);
    expect(user[__brand]).toBe(beforeBrand);
    expect(user[__brand]).toEqual({ User: true });
    expect(verified[__brand]).toEqual({ User: true, VerifiedUser: true });
  });

  it("keeps shape methods on prototype, so they are not copied by spread/json", () => {
    const user = User.create({
      id: "u-7",
      isVerified: true,
      additionalData: "visible",
    });
    const verified = VerifiedUserRefinement.from(user);

    expect(verified.hasAdditionalData()).toBe(true);
    expect(Object.keys(verified)).not.toContain("hasAdditionalData");

    const spread = { ...verified } as Record<string, unknown>;
    expect("hasAdditionalData" in spread).toBe(false);

    const serialized = JSON.stringify(verified);
    expect(serialized).not.toContain("hasAdditionalData");
  });
});

describe("multiple refinements on the same shape", () => {
  it("ProfileEnriched from base user matches ProfileEnrichedUser", () => {
    const user = User.create({
      id: "u-mr-0",
      isVerified: true,
      additionalData: "hello world profile",
      avatarSrc: "https://cdn.example/avatar.png",
    });
    const enriched: ProfileEnrichedUser = ProfileEnrichedRefinement.from(user);
    expect(enriched.profileWordCount()).toBe(3);
    expect(ProfileEnrichedRefinement.is(enriched)).toBe(true);
  });

  it("stacks brands; shape prototype methods remain available on chained refinements", () => {
    const user = User.create({
      id: "u-mr-1",
      isVerified: true,
      additionalData: "hello world profile",
      avatarSrc: "https://cdn.example/avatar.png",
    });

    const verified = VerifiedUserRefinement.from(user);
    const enriched = ProfileEnrichedRefinement.from(verified);

    expect(enriched[__brand]).toEqual({
      User: true,
      VerifiedUser: true,
      ProfileEnriched: true,
    });

    expect(enriched.canAccessAdminArea()).toBe(true);
    expect(enriched.hasAdditionalData()).toBe(true);
    expect(enriched.hasAvatar()).toBe(true);
    expect(enriched.profileWordCount()).toBe(3);
    expect(enriched.avatarSrc).toBe("https://cdn.example/avatar.png");

    expect(VerifiedUserRefinement.is(enriched)).toBe(true);
    expect(ProfileEnrichedRefinement.is(enriched)).toBe(true);
  });

  it("rejects the second refinement when additionalData is too short even if VerifiedUser passed", () => {
    const user = User.create({
      id: "u-mr-2",
      isVerified: true,
      additionalData: "hi",
      avatarSrc: "https://cdn.example/avatar.png",
    });

    const verified = VerifiedUserRefinement.from(user);
    expect(verified.additionalData).toBe("hi");

    expect(() => ProfileEnrichedRefinement.from(verified)).toThrow(BrandedRefinementError);
  });

  it("rejects the second refinement when avatarSrc is missing even if VerifiedUser passed", () => {
    const user = User.create({
      id: "u-mr-2b",
      isVerified: true,
      additionalData: "long enough profile text",
    });

    const verified = VerifiedUserRefinement.from(user);
    expect(() => ProfileEnrichedRefinement.from(verified)).toThrow(BrandedRefinementError);
  });

  it("shape patch preserves all stacked refinement brands", () => {
    const user = User.create({
      id: "u-mr-3",
      isVerified: true,
      additionalData: "long enough text here",
      avatarSrc: "https://cdn.example/face.jpg",
    });
    const enriched = ProfileEnrichedRefinement.from(VerifiedUserRefinement.from(user));

    const next = patchUser(enriched, {
      additionalData: "updated long enough text",
    });

    expect(next.additionalData).toBe("updated long enough text");
    expect(next.avatarSrc).toBe("https://cdn.example/face.jpg");
    expect(next[__brand]).toEqual({
      User: true,
      VerifiedUser: true,
      ProfileEnriched: true,
    });
    expect(VerifiedUserRefinement.is(next)).toBe(true);
    expect(ProfileEnrichedRefinement.is(next)).toBe(true);
    expect(next.profileWordCount()).toBeGreaterThan(0);
    expect(next.hasAvatar()).toBe(true);
  });
});

/**
 * BaseShape
 * → RefinedShape1 (same base)
 * → RefinedShape2 (same base, sibling of 1)
 * → RefinedShape3 on RefinedShape2
 * → RefinedShape4 on RefinedShape3
 */
describe("nested refinement chain (sibling refinements + stack on one branch)", () => {
  const DocSchema = z.object({
    id: z.string(),
    score: z.number(),
    stage: z.number().int().min(0).max(3),
  });

  const [BaseShape] = branded.shape("Doc", DocSchema, {
    methods: {
      isDoc: () => true,
    },
  });
  type DocEntity = BrandedType<typeof BaseShape>;

  type ScoreTenPlus = DocEntity & { score: number };
  const RefinedShape1 = branded
    .refine(BaseShape)
    .when((d): d is ScoreTenPlus => d.score >= 10)
    .as("ScoreTenPlus");

  type MatureStage = DocEntity & { stage: number };
  const RefinedShape2 = branded
    .refine(BaseShape)
    .when((d): d is MatureStage => d.stage >= 2)
    .as("MatureStage");

  type MatureDoc = BrandedType<typeof RefinedShape2>;
  type MatureAndScored = MatureDoc & { score: number };
  const RefinedShape3 = branded
    .refine(RefinedShape2)
    .when((d): d is MatureAndScored => d.score >= 20)
    .as("MatureScored");

  type MatureScoredDoc = BrandedType<typeof RefinedShape3>;
  const RefinedShape4 = branded
    .refine(RefinedShape3)
    .when((d): d is MatureScoredDoc => d.score >= 30)
    .as("VeryMature");

  type VeryMatureDoc = BrandedType<typeof RefinedShape4>;

  it("applies sibling refinements independently; each gate rejects the other sibling’s inputs", () => {
    const highScoreEarly = BaseShape.create({ id: "d-0a", score: 15, stage: 0 });
    const r1 = RefinedShape1.from(highScoreEarly);
    expect(() => RefinedShape2.from(highScoreEarly)).toThrow(BrandedRefinementError);

    const lowScoreLate = BaseShape.create({ id: "d-0b", score: 5, stage: 3 });
    const r2 = RefinedShape2.from(lowScoreLate);
    expect(() => RefinedShape1.from(lowScoreLate)).toThrow(BrandedRefinementError);

    expect(r1[__brand]).toEqual({ Doc: true, ScoreTenPlus: true });
    expect(r2[__brand]).toEqual({ Doc: true, MatureStage: true });
    expect(RefinedShape1.is(r2)).toBe(false);
    expect(RefinedShape2.is(r1)).toBe(false);
  });

  it("when both sibling predicates hold on the same base, each refinement kit can still from() it", () => {
    const base = BaseShape.create({ id: "d-0c", score: 15, stage: 2 });
    expect(RefinedShape1.from(base)[__brand]).toEqual({ Doc: true, ScoreTenPlus: true });
    expect(RefinedShape2.from(base)[__brand]).toEqual({ Doc: true, MatureStage: true });
  });

  it("chains R2 → R3 → R4 and accumulates brands along the nested branch", () => {
    const base = BaseShape.create({ id: "d-1", score: 35, stage: 2 });
    const r2 = RefinedShape2.from(base);
    const r3 = RefinedShape3.from(r2);
    const r4: VeryMatureDoc = RefinedShape4.from(r3);

    expect(r4.id).toBe("d-1");
    expect(r4.score).toBe(35);
    expect(r4.stage).toBe(2);
    expect(r4[__brand]).toEqual({
      Doc: true,
      MatureStage: true,
      MatureScored: true,
      VeryMature: true,
    });
    expect(RefinedShape2.is(r4)).toBe(true);
    expect(RefinedShape3.is(r4)).toBe(true);
    expect(RefinedShape4.is(r4)).toBe(true);
  });

  it("rejects R3 when the base only satisfies MatureStage but not the R3 score gate", () => {
    const base = BaseShape.create({ id: "d-2", score: 12, stage: 3 });
    const r2 = RefinedShape2.from(base);
    expect(() => RefinedShape3.from(r2)).toThrow(BrandedRefinementError);
  });

  it("rejects R4 when R3 passes but score is below the R4 gate", () => {
    const base = BaseShape.create({ id: "d-3", score: 25, stage: 2 });
    const r2 = RefinedShape2.from(base);
    const r3 = RefinedShape3.from(r2);
    expect(() => RefinedShape4.from(r3)).toThrow(BrandedRefinementError);
  });

  it("branded.combine matches manual R2 → R3 → R4 chain", () => {
    const AllMature = branded
      .combine(RefinedShape2)
      .with(RefinedShape3)
      .with(RefinedShape4)
      .as("AllMature");
    const base = BaseShape.create({ id: "d-c", score: 40, stage: 3 });
    const manual = RefinedShape4.from(RefinedShape3.from(RefinedShape2.from(base)));
    const via = AllMature.from(base);
    expect(via[__brand]).toEqual(manual[__brand]);
    expect(AllMature.is(base)).toBe(true);
    expect(AllMature.tryFrom(base)).not.toBeNull();
  });
});

describe("branded.combine", () => {
  const VerifiedAndProfile = branded
    .combine(VerifiedUserRefinement)
    .with(ProfileEnrichedRefinement)
    .as("VerifiedAndProfile");

  type VerifiedAndProfileUser = BrandedType<typeof VerifiedAndProfile>;

  it("chains from() like manual ProfileEnriched.from(VerifiedUser.from(…))", () => {
    const user = User.create({
      id: "u-combo-0",
      isVerified: true,
      additionalData: "hello world profile",
      avatarSrc: "https://cdn.example/avatar.png",
    });
    const combined: VerifiedAndProfileUser = VerifiedAndProfile.from(user);
    const manual = ProfileEnrichedRefinement.from(VerifiedUserRefinement.from(user));

    expect(combined[__brand]).toEqual(manual[__brand]);
    expect(combined[__brand]).toEqual({
      User: true,
      VerifiedUser: true,
      ProfileEnriched: true,
    });
    expect(combined.profileWordCount()).toBe(3);
  });

  it("exposes the composite brand name on the kit", () => {
    expect(VerifiedAndProfile.brand).toBe("VerifiedAndProfile");
  });

  it("tryFrom returns null when an intermediate refinement fails", () => {
    const user = User.create({
      id: "u-combo-1",
      isVerified: true,
      additionalData: "hi",
      avatarSrc: "https://cdn.example/avatar.png",
    });
    expect(VerifiedUserRefinement.tryFrom(user)).not.toBeNull();
    expect(VerifiedAndProfile.tryFrom(user)).toBeNull();
  });

  it("is mirrors tryFrom success", () => {
    const ok = User.create({
      id: "u-combo-2",
      isVerified: true,
      additionalData: "long enough profile text",
      avatarSrc: "https://cdn.example/x.png",
    });
    const bad = User.create({
      id: "u-combo-3",
      isVerified: true,
      additionalData: "long enough profile text",
    });
    expect(VerifiedAndProfile.is(ok)).toBe(true);
    expect(VerifiedAndProfile.is(bad)).toBe(false);
  });

  it("from() throws BrandedRefinementError from the failing inner kit", () => {
    const user = User.create({
      id: "u-combo-4",
      isVerified: true,
      additionalData: "tiny",
      avatarSrc: "https://cdn.example/a.png",
    });
    expect(() => VerifiedAndProfile.from(user)).toThrow(BrandedRefinementError);
    try {
      VerifiedAndProfile.from(user);
    } catch (e) {
      expect(e).toMatchObject({ brand: "ProfileEnriched" });
    }
  });

  it("rejects duplicate input refinement brands", () => {
    expect(() =>
      branded.combine(VerifiedUserRefinement).with(VerifiedUserRefinement).as("Dup")
    ).toThrow(TypeError);
  });

  it("requires at least two refinements before as()", () => {
    expect(() => branded.combine(VerifiedUserRefinement).as("OnlyOne")).toThrow(TypeError);
  });
});
