import { describe, expect, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import type { BrandedType } from "./types";
import { BrandedRefinementError } from "./errors";

const UserSchema = z.object({
  type: z.literal("User").default("User"),
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
    /**
     * Breaks `VerifiedUser` when applied to a refined instance; delegates to `patchUser` (base entity).
     * Refinements must be re-established via `tryFrom` / `from`.
     */
    patchRevokeVerification() {
      return patchUser(this, { isVerified: false });
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
    expect(User.is(verified)).toBe(true);
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
    expect(User.is(next)).toBe(true);
    expect(VerifiedUserRefinement.is(next)).toBe(true);
  });

  it("free patch returns base shape type; semantic methods may use `as T` when the delta preserves refinements", () => {
    const user = User.create({
      id: "u-patch-refined-return-type",
      isVerified: true,
      additionalData: "ok",
    });
    const verified = VerifiedUserRefinement.from(user);

    const viaMethod = verified.patchRevokeVerification();
    const viaPatch = patchUser(verified, { isVerified: false });

    const _fromMethod: UserEntity = viaMethod;
    const _fromPatch: UserEntity = viaPatch;

    // @ts-expect-error patch strips refinement from the type; use tryFrom/from to narrow again
    const _methodWrong: VerifiedUser = viaMethod;
    // @ts-expect-error patch strips refinement from the type; use tryFrom/from to narrow again
    const _patchWrong: VerifiedUser = viaPatch;

    expect(viaMethod.isVerified).toBe(false);
    expect(viaPatch.isVerified).toBe(false);
    expect(VerifiedUserRefinement.is(viaMethod)).toBe(false);
    expect(VerifiedUserRefinement.is(viaPatch)).toBe(false);
    expect(User.is(viaMethod)).toBe(true);
    expect(User.is(viaPatch)).toBe(true);
  });

  it("from() does not mutate the source value and returns a frozen clone", () => {
    const user = User.create({
      id: "u-5",
      isVerified: true,
      additionalData: "ok",
    });

    const verified = VerifiedUserRefinement.from(user);

    expect(verified).not.toBe(user);
    expect(Object.isFrozen(verified)).toBe(true);
    expect(user.isVerified).toBe(true);
    expect(User.is(user)).toBe(true);
    expect(User.is(verified)).toBe(true);
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

  it("stacks refinements; shape prototype methods remain available on chained refinements", () => {
    const user = User.create({
      id: "u-mr-1",
      isVerified: true,
      additionalData: "hello world profile",
      avatarSrc: "https://cdn.example/avatar.png",
    });

    const verified = VerifiedUserRefinement.from(user);
    const enriched = ProfileEnrichedRefinement.from(verified);

    expect(User.is(enriched)).toBe(true);

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

  it("shape patch keeps shape prototype; stacked refinements still satisfy `when`", () => {
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
    expect(User.is(next)).toBe(true);
    expect(VerifiedUserRefinement.is(next)).toBe(true);
    expect(ProfileEnrichedRefinement.is(next)).toBe(true);
    expect(next.profileWordCount()).toBeGreaterThan(0);
    expect(next.hasAvatar()).toBe(true);
  });
});

/**
 * DocShape
 * → ScoreTenPlusShape (same base)
 * → AdvancedStageShape (same base, sibling of ScoreTenPlusShape)
 * → AdvancedScoredShape on AdvancedStageShape
 * → EliteDocShape on AdvancedScoredShape
 */
describe("nested refinement chain (sibling refinements + stack on one branch)", () => {
  const DocSchema = z.object({
    type: z.literal("Doc").default("Doc"),
    id: z.string(),
    score: z.number(),
    stage: z.number().int().min(0).max(3),
  });

  type DocProps = z.infer<typeof DocSchema>;

  const [DocShape] = branded.shape("Doc", DocSchema, {
    methods: {
      isDoc: () => true,
    },
  });
  type Doc = BrandedType<typeof DocShape>;

  type ScoreTenPlusProps = Doc & { score: number };
  const ScoreTenPlusShape = branded
    .refine(DocShape)
    .when((d): d is ScoreTenPlusProps => d.score >= 10)
    .as("ScoreTenPlus");
  type ScoreTenPlusDoc = BrandedType<typeof ScoreTenPlusShape>;

  type AdvancedStageProps = Doc & { stage: number };
  const AdvancedStageShape = branded
    .refine(DocShape)
    .when((d): d is AdvancedStageProps => d.stage >= 2)
    .as("AdvancedStage");
  type AdvancedStageDoc = BrandedType<typeof AdvancedStageShape>;

  type AdvancedScoredProps = AdvancedStageDoc & { score: number };
  const AdvancedScoredShape = branded
    .refine(AdvancedStageShape)
    .when((d): d is AdvancedScoredProps => d.score >= 20)
    .as("AdvancedScored");
  type AdvancedScoredDoc = BrandedType<typeof AdvancedScoredShape>;

  const EliteDocShape = branded
    .refine(AdvancedScoredShape)
    .when((d): d is AdvancedScoredDoc => d.score >= 30)
    .as("EliteDoc");
  type EliteDoc = BrandedType<typeof EliteDocShape>;

  it("applies sibling refinements independently; each gate rejects the other sibling’s inputs", () => {
    const highScoreEarly = DocShape.create({
      id: "d-0a",
      score: 15,
      stage: 0,
      type: "Doc",
    } satisfies DocProps);
    const r1: ScoreTenPlusDoc = ScoreTenPlusShape.from(highScoreEarly);
    expect(() => AdvancedStageShape.from(highScoreEarly)).toThrow(BrandedRefinementError);

    const lowScoreLate = DocShape.create({ id: "d-0b", score: 5, stage: 3 });
    const r2 = AdvancedStageShape.from(lowScoreLate);
    expect(() => ScoreTenPlusShape.from(lowScoreLate)).toThrow(BrandedRefinementError);

    expect(DocShape.is(r1)).toBe(true);
    expect(DocShape.is(r2)).toBe(true);
    expect(ScoreTenPlusShape.is(r2)).toBe(false);
    expect(AdvancedStageShape.is(r1)).toBe(false);
  });

  it("when both sibling predicates hold on the same base, each refinement kit can still from() it", () => {
    const base = DocShape.create({ id: "d-0c", score: 15, stage: 2 });
    expect(DocShape.is(ScoreTenPlusShape.from(base))).toBe(true);
    expect(DocShape.is(AdvancedStageShape.from(base))).toBe(true);
  });

  it("chains AdvancedStageShape → AdvancedScoredShape → EliteDocShape and accumulates brands along the nested branch", () => {
    const base = DocShape.create({ id: "d-1", score: 35, stage: 2 });
    const r2 = AdvancedStageShape.from(base);
    const r3 = AdvancedScoredShape.from(r2);
    const r4: EliteDoc = EliteDocShape.from(r3);

    expect(r4.id).toBe("d-1");
    expect(r4.score).toBe(35);
    expect(r4.stage).toBe(2);
    expect(DocShape.is(r4)).toBe(true);
    expect(AdvancedStageShape.is(r4)).toBe(true);
    expect(AdvancedScoredShape.is(r4)).toBe(true);
    expect(EliteDocShape.is(r4)).toBe(true);
  });

  it("rejects AdvancedScoredShape when the base only satisfies AdvancedStage but not the score gate", () => {
    const base = DocShape.create({ id: "d-2", score: 12, stage: 3 });
    const r2 = AdvancedStageShape.from(base);
    expect(() => AdvancedScoredShape.from(r2)).toThrow(BrandedRefinementError);
  });

  it("rejects EliteDocShape when AdvancedScored passes but score is below the Elite gate", () => {
    const base = DocShape.create({ id: "d-3", score: 25, stage: 2 });
    const r2 = AdvancedStageShape.from(base);
    const r3 = AdvancedScoredShape.from(r2);
    expect(() => EliteDocShape.from(r3)).toThrow(BrandedRefinementError);
  });

  it("branded.refineChain matches manual AdvancedStage → AdvancedScored → EliteDoc chain", () => {
    const AdvancedPipelineKit = branded
      .refineChain(AdvancedStageShape)
      .with(AdvancedScoredShape)
      .with(EliteDocShape)
      .build();
    const base = DocShape.create({ id: "d-c", score: 40, stage: 3 });
    const manual = EliteDocShape.from(AdvancedScoredShape.from(AdvancedStageShape.from(base)));
    const via = AdvancedPipelineKit.from(base);
    expect(via).toEqual(manual);
    expect(AdvancedPipelineKit.is(base)).toBe(true);
    expect(AdvancedPipelineKit.tryFrom(base)).not.toBeNull();
  });
});

describe("branded.refineChain", () => {
  const VerifiedAndProfile = branded
    .refineChain(VerifiedUserRefinement)
    .with(ProfileEnrichedRefinement)
    .build();

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

    expect(combined).toEqual(manual);
    expect(combined.profileWordCount()).toBe(3);
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
      branded.refineChain(VerifiedUserRefinement).with(VerifiedUserRefinement).build()
    ).toThrow(TypeError);
  });

  it("requires at least two refinements before build()", () => {
    expect(() => branded.refineChain(VerifiedUserRefinement).build()).toThrow(TypeError);
  });
});
