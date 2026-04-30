import { z } from "zod";
import * as v from "valibot";
import type { Validator } from "@xndrjs/domain";

import type { BenchmarkEngine, BenchmarkMode, RawSchema } from "../adapters";
import type { BenchmarkCase, BenchmarkScenario } from "../runner";
import type { RunnerContext } from "../runner/types";

const SUPPORTED_SIZES = [100_000, 500_000] as const;
const INVALID_RATE_BY_SIZE: Record<number, number> = {
  100_000: 0.01,
  500_000: 0.05,
};
const STATUSES = ["active", "inactive", "pending"] as const;
const SOURCES = ["legacy-api", "csv-import", "manual"] as const;

type MigrationStatus = (typeof STATUSES)[number];
type MigrationSource = (typeof SOURCES)[number];

interface MigrationRow {
  readonly id: number;
  readonly accountId: string;
  readonly email: string;
  readonly status: MigrationStatus;
  readonly retries: number;
  readonly profile: {
    readonly firstName: string;
    readonly lastName: string;
    readonly age: number;
    readonly countryCode: string;
  };
  readonly metadata: {
    readonly source: MigrationSource;
    readonly score: number;
    readonly migratedAt: string;
  };
  readonly tags: readonly string[];
}

function assertSupportedInputSize(inputSize: number): void {
  if (!SUPPORTED_SIZES.includes(inputSize as (typeof SUPPORTED_SIZES)[number])) {
    throw new Error(
      `Scenario "migration-batch" supports only input sizes ${SUPPORTED_SIZES.join(", ")}.`
    );
  }
}

function randomAlpha(context: RunnerContext, minLength: number, maxLength: number): string {
  const length = minLength + context.rng.int(maxLength - minLength + 1);
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += alphabet[context.rng.int(alphabet.length)];
  }
  return output;
}

function buildValidRow(index: number, context: RunnerContext): MigrationRow {
  const firstName = randomAlpha(context, 4, 10);
  const lastName = randomAlpha(context, 5, 12);
  const accountSuffix = String(context.rng.int(1_000_000_000)).padStart(9, "0");
  const countryCode = context.rng.next() > 0.5 ? "IT" : "US";
  const status = STATUSES[index % STATUSES.length] ?? STATUSES[0];
  const source = SOURCES[index % SOURCES.length] ?? SOURCES[0];
  const scoreRaw = context.rng.next();
  const score = Math.round(scoreRaw * 1_000) / 1_000;
  const retries = context.rng.int(4);
  const age = 18 + context.rng.int(53);
  const migratedAt = new Date(1_700_000_000_000 + index * 1_000).toISOString();

  return {
    id: index + 1,
    accountId: `ACC-${accountSuffix}`,
    email: `${firstName ?? "name"}.${lastName ?? "surname"}.${index}@example.org`,
    status,
    retries,
    profile: {
      firstName,
      lastName,
      age,
      countryCode,
    },
    metadata: {
      source,
      score,
      migratedAt,
    },
    tags: [status, source, countryCode.toLowerCase()],
  };
}

function buildInvalidRow(row: MigrationRow): unknown {
  return {
    ...row,
    email: "invalid-email-format",
    profile: {
      ...row.profile,
      age: 9,
    },
    metadata: {
      ...row.metadata,
      score: 1.6,
    },
    tags: [],
  };
}

function buildInputs(args: {
  mode: BenchmarkMode;
  inputSize: number;
  context: RunnerContext;
}): readonly unknown[] {
  const { mode, inputSize, context } = args;
  const invalidRate = mode === "invalid" ? (INVALID_RATE_BY_SIZE[inputSize] ?? 0) : 0;
  return Array.from({ length: inputSize }, (_, index) => {
    const validRow = buildValidRow(index, context);
    if (invalidRate <= 0) {
      return validRow;
    }
    const shouldInvalidate = context.rng.next() < invalidRate;
    return shouldInvalidate ? buildInvalidRow(validRow) : validRow;
  });
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function isMigrationRow(input: unknown): input is MigrationRow {
  if (!isObject(input)) {
    return false;
  }
  const profile = input.profile;
  const metadata = input.metadata;

  if (
    typeof input.id !== "number" ||
    !Number.isInteger(input.id) ||
    input.id <= 0 ||
    typeof input.accountId !== "string" ||
    !input.accountId.startsWith("ACC-") ||
    input.accountId.length < 8 ||
    typeof input.email !== "string" ||
    !input.email.includes("@") ||
    !STATUSES.includes(input.status as MigrationStatus) ||
    typeof input.retries !== "number" ||
    !Number.isInteger(input.retries) ||
    input.retries < 0 ||
    input.retries > 3
  ) {
    return false;
  }

  if (
    !isObject(profile) ||
    typeof profile.firstName !== "string" ||
    profile.firstName.length < 2 ||
    typeof profile.lastName !== "string" ||
    profile.lastName.length < 2 ||
    typeof profile.age !== "number" ||
    !Number.isInteger(profile.age) ||
    profile.age < 18 ||
    profile.age > 70 ||
    typeof profile.countryCode !== "string" ||
    profile.countryCode.length !== 2
  ) {
    return false;
  }

  if (
    !isObject(metadata) ||
    !SOURCES.includes(metadata.source as MigrationSource) ||
    typeof metadata.score !== "number" ||
    metadata.score < 0 ||
    metadata.score > 1 ||
    typeof metadata.migratedAt !== "string" ||
    Number.isNaN(Date.parse(metadata.migratedAt))
  ) {
    return false;
  }

  if (!Array.isArray(input.tags) || input.tags.length < 1) {
    return false;
  }
  if (input.tags.some((value) => typeof value !== "string" || value.length < 2)) {
    return false;
  }

  return true;
}

function buildCoreSchema(): Validator<unknown, MigrationRow> {
  return {
    engine: "core-custom",
    validate(input) {
      if (isMigrationRow(input)) {
        return { success: true, data: input };
      }
      return {
        success: false,
        error: {
          engine: "core-custom",
          issues: [
            {
              code: "invalid_migration_row",
              path: [],
              message: "Input does not satisfy migration-batch constraints.",
            },
          ],
        },
      };
    },
  };
}

function buildZodSchema(): z.ZodType<MigrationRow> {
  return z.object({
    id: z.number().int().positive(),
    accountId: z.string().startsWith("ACC-").min(8),
    email: z.email(),
    status: z.enum(STATUSES),
    retries: z.number().int().min(0).max(3),
    profile: z.object({
      firstName: z.string().min(2),
      lastName: z.string().min(2),
      age: z.number().int().min(18).max(70),
      countryCode: z.string().length(2),
    }),
    metadata: z.object({
      source: z.enum(SOURCES),
      score: z.number().min(0).max(1),
      migratedAt: z.string().datetime(),
    }),
    tags: z.array(z.string().min(2)).min(1),
  });
}

function buildValibotSchema(): v.GenericSchema {
  return v.object({
    id: v.pipe(v.number(), v.integer(), v.minValue(1)),
    accountId: v.pipe(v.string(), v.startsWith("ACC-"), v.minLength(8)),
    email: v.pipe(v.string(), v.email()),
    status: v.picklist(STATUSES),
    retries: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3)),
    profile: v.object({
      firstName: v.pipe(v.string(), v.minLength(2)),
      lastName: v.pipe(v.string(), v.minLength(2)),
      age: v.pipe(v.number(), v.integer(), v.minValue(18), v.maxValue(70)),
      countryCode: v.pipe(v.string(), v.length(2)),
    }),
    metadata: v.object({
      source: v.picklist(SOURCES),
      score: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
      migratedAt: v.pipe(v.string(), v.isoTimestamp()),
    }),
    tags: v.pipe(v.array(v.pipe(v.string(), v.minLength(2))), v.minLength(1)),
  });
}

function buildSchema(engine: BenchmarkEngine): BenchmarkCase["schema"] {
  switch (engine) {
    case "zod":
      return buildZodSchema();
    case "valibot":
      return buildValibotSchema();
    case "core":
      return buildCoreSchema();
    case "raw":
      return { parse: (input) => input } satisfies RawSchema;
    default: {
      const exhaustive: never = engine;
      throw new Error(`Unhandled engine "${String(exhaustive)}".`);
    }
  }
}

export const migrationBatchScenario: BenchmarkScenario = {
  name: "migration-batch",
  description:
    "Batch migration workload with deterministic 100k/500k datasets and controlled invalid ratio.",
  supportedEngines: ["zod", "valibot", "core", "raw"],
  createCase({ engine, mode, inputSize, context }) {
    assertSupportedInputSize(inputSize);
    return {
      schema: buildSchema(engine),
      inputs: buildInputs({ mode, inputSize, context }),
    };
  },
};
