import { z } from "zod";
import * as v from "valibot";
import type { Validator } from "@xndrjs/domain";

import type { BenchmarkEngine, BenchmarkMode, RawSchema } from "../adapters";
import type { BenchmarkCase, BenchmarkScenario } from "../runner";
import type { RunnerContext } from "../runner/types";

const SUPPORTED_SIZES = [2_000, 10_000] as const;
const COUNTRIES = ["IT", "DE", "FR", "ES"] as const;
const CHANNELS = ["email", "sms", "push"] as const;
const INVALID_RATE = 0.03;

type Country = (typeof COUNTRIES)[number];
type Channel = (typeof CHANNELS)[number];

interface AddressInput {
  readonly line1: string;
  readonly city: string;
  readonly postalCode: string;
  readonly country: Country;
}

interface ContactInput {
  readonly name: string;
  readonly phone: string;
}

interface FeMediumFormInput {
  readonly userId: string;
  readonly profile: {
    readonly firstName: string;
    readonly lastName: string;
    readonly birthYear: number;
    readonly locale: string;
  };
  readonly contact: {
    readonly email: string;
    readonly phone: string;
    readonly preferredChannel: Channel;
  };
  readonly addresses: readonly AddressInput[];
  readonly emergencyContacts: readonly ContactInput[];
  readonly preferences: {
    readonly newsletter: boolean;
    readonly darkMode: boolean;
    readonly tags: readonly string[];
    readonly maxItemsPerPage: number;
    readonly timezoneOffsetMinutes: number;
  };
  readonly security: {
    readonly mfaEnabled: boolean;
    readonly backupEmail: string;
  };
  readonly metadata: {
    readonly source: "web";
    readonly campaign: string;
    readonly acceptedTermsAt: string;
  };
}

interface FeMediumFormOutput extends FeMediumFormInput {
  readonly profile: FeMediumFormInput["profile"] & { readonly fullName: string };
  readonly contact: FeMediumFormInput["contact"] & { readonly email: string };
  readonly addresses: readonly AddressInput[];
}

function assertSupportedInputSize(inputSize: number): void {
  if (!SUPPORTED_SIZES.includes(inputSize as (typeof SUPPORTED_SIZES)[number])) {
    throw new Error(
      `Scenario "fe-medium-form" supports only input sizes ${SUPPORTED_SIZES.join(", ")}.`
    );
  }
}

function randomWord(context: RunnerContext, minLength: number, maxLength: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const length = minLength + context.rng.int(maxLength - minLength + 1);
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += alphabet[context.rng.int(alphabet.length)];
  }
  return output;
}

function buildValidInput(index: number, context: RunnerContext): FeMediumFormInput {
  const firstName = randomWord(context, 4, 9);
  const lastName = randomWord(context, 5, 11);
  const userId = `usr_${String(index + 1).padStart(6, "0")}`;
  const countryPrimary = COUNTRIES[index % COUNTRIES.length] ?? COUNTRIES[0];
  const countrySecondary = COUNTRIES[(index + 1) % COUNTRIES.length] ?? COUNTRIES[0];
  const preferredChannel = CHANNELS[index % CHANNELS.length] ?? CHANNELS[0];
  const acceptedTermsAt = new Date(1_710_000_000_000 + index * 5_000).toISOString();

  return {
    userId,
    profile: {
      firstName,
      lastName,
      birthYear: 1970 + (index % 35),
      locale: index % 2 === 0 ? "it-IT" : "en-US",
    },
    contact: {
      email: `${firstName}.${lastName}.${index}@example.org`,
      phone: `+39${String(100_000_000 + context.rng.int(899_999_999))}`,
      preferredChannel,
    },
    addresses: [
      {
        line1: `${10 + context.rng.int(180)} ${randomWord(context, 5, 10)} street`,
        city: index % 2 === 0 ? "Milan" : "Turin",
        postalCode: `${10000 + context.rng.int(89999)}`,
        country: countryPrimary,
      },
      {
        line1: `${1 + context.rng.int(70)} ${randomWord(context, 5, 9)} avenue`,
        city: index % 2 === 0 ? "Rome" : "Naples",
        postalCode: `${10000 + context.rng.int(89999)}`,
        country: countrySecondary,
      },
    ],
    emergencyContacts: [
      {
        name: `${randomWord(context, 4, 8)} ${randomWord(context, 5, 10)}`,
        phone: `+39${String(100_000_000 + context.rng.int(899_999_999))}`,
      },
      {
        name: `${randomWord(context, 4, 8)} ${randomWord(context, 5, 10)}`,
        phone: `+39${String(100_000_000 + context.rng.int(899_999_999))}`,
      },
    ],
    preferences: {
      newsletter: context.rng.next() > 0.35,
      darkMode: context.rng.next() > 0.5,
      tags: ["beta", `segment-${index % 4}`, `cohort-${index % 10}`],
      maxItemsPerPage: 10 + (index % 5) * 10,
      timezoneOffsetMinutes: index % 2 === 0 ? 60 : 120,
    },
    security: {
      mfaEnabled: context.rng.next() > 0.4,
      backupEmail: `${firstName}.${lastName}.${index}.backup@example.org`,
    },
    metadata: {
      source: "web",
      campaign: `spring-${index % 8}`,
      acceptedTermsAt,
    },
  };
}

function buildInvalidInput(input: FeMediumFormInput): unknown {
  return {
    ...input,
    contact: {
      ...input.contact,
      email: "invalid-email",
    },
    addresses: [
      {
        ...input.addresses[0],
        postalCode: "00",
      },
      {
        ...input.addresses[1],
        country: "UK",
      },
    ],
    preferences: {
      ...input.preferences,
      tags: ["x"],
      maxItemsPerPage: 400,
    },
    security: {
      ...input.security,
      backupEmail: "broken-backup-mail",
    },
  };
}

function buildInputs(args: {
  mode: BenchmarkMode;
  inputSize: number;
  context: RunnerContext;
}): readonly unknown[] {
  const { mode, inputSize, context } = args;
  return Array.from({ length: inputSize }, (_, index) => {
    const payload = buildValidInput(index, context);
    if (mode === "invalid" && context.rng.next() < INVALID_RATE) {
      return buildInvalidInput(payload);
    }
    return payload;
  });
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function isValidMediumForm(input: unknown): input is FeMediumFormInput {
  if (!isObject(input) || typeof input.userId !== "string" || !input.userId.startsWith("usr_")) {
    return false;
  }

  const profile = input.profile;
  const contact = input.contact;
  const preferences = input.preferences;
  const security = input.security;
  const metadata = input.metadata;

  if (
    !isObject(profile) ||
    typeof profile.firstName !== "string" ||
    profile.firstName.length < 2 ||
    typeof profile.lastName !== "string" ||
    profile.lastName.length < 2 ||
    typeof profile.birthYear !== "number" ||
    !Number.isInteger(profile.birthYear) ||
    profile.birthYear < 1940 ||
    profile.birthYear > 2010 ||
    typeof profile.locale !== "string" ||
    profile.locale.length < 4
  ) {
    return false;
  }

  if (
    !isObject(contact) ||
    typeof contact.email !== "string" ||
    !contact.email.includes("@") ||
    typeof contact.phone !== "string" ||
    !contact.phone.startsWith("+") ||
    !CHANNELS.includes(contact.preferredChannel as Channel)
  ) {
    return false;
  }

  if (!Array.isArray(input.addresses) || input.addresses.length !== 2) {
    return false;
  }
  for (const address of input.addresses) {
    if (
      !isObject(address) ||
      typeof address.line1 !== "string" ||
      address.line1.length < 5 ||
      typeof address.city !== "string" ||
      address.city.length < 2 ||
      typeof address.postalCode !== "string" ||
      address.postalCode.length < 5 ||
      !COUNTRIES.includes(address.country as Country)
    ) {
      return false;
    }
  }

  if (!Array.isArray(input.emergencyContacts) || input.emergencyContacts.length !== 2) {
    return false;
  }
  for (const emergency of input.emergencyContacts) {
    if (
      !isObject(emergency) ||
      typeof emergency.name !== "string" ||
      emergency.name.length < 5 ||
      typeof emergency.phone !== "string" ||
      !emergency.phone.startsWith("+")
    ) {
      return false;
    }
  }

  if (
    !isObject(preferences) ||
    typeof preferences.newsletter !== "boolean" ||
    typeof preferences.darkMode !== "boolean" ||
    !Array.isArray(preferences.tags) ||
    preferences.tags.length < 2 ||
    preferences.tags.some((tag) => typeof tag !== "string" || tag.length < 2) ||
    typeof preferences.maxItemsPerPage !== "number" ||
    !Number.isInteger(preferences.maxItemsPerPage) ||
    preferences.maxItemsPerPage < 10 ||
    preferences.maxItemsPerPage > 100 ||
    typeof preferences.timezoneOffsetMinutes !== "number"
  ) {
    return false;
  }

  if (
    !isObject(security) ||
    typeof security.mfaEnabled !== "boolean" ||
    typeof security.backupEmail !== "string" ||
    !security.backupEmail.includes("@")
  ) {
    return false;
  }

  if (
    !isObject(metadata) ||
    metadata.source !== "web" ||
    typeof metadata.campaign !== "string" ||
    metadata.campaign.length < 3 ||
    typeof metadata.acceptedTermsAt !== "string" ||
    Number.isNaN(Date.parse(metadata.acceptedTermsAt))
  ) {
    return false;
  }

  return true;
}

function toTransformedOutput(input: FeMediumFormInput): FeMediumFormOutput {
  return {
    ...input,
    profile: {
      ...input.profile,
      fullName: `${input.profile.firstName.trim()} ${input.profile.lastName.trim()}`,
    },
    contact: {
      ...input.contact,
      email: input.contact.email.trim().toLowerCase(),
    },
    addresses: input.addresses.map((address) => ({
      ...address,
      line1: address.line1.trim(),
    })),
  };
}

function buildCoreSchema(transformEnabled: boolean): Validator<unknown, unknown> {
  return {
    engine: "core-custom",
    validate(input) {
      if (!isValidMediumForm(input)) {
        return {
          success: false,
          error: {
            engine: "core-custom",
            issues: [
              {
                code: "invalid_fe_medium_form",
                path: [],
                message: "Input does not satisfy fe-medium-form constraints.",
              },
            ],
          },
        };
      }
      return {
        success: true,
        data: transformEnabled ? toTransformedOutput(input) : input,
      };
    },
  };
}

function buildZodSchema(transformEnabled: boolean): z.ZodTypeAny {
  const schema = z.object({
    userId: z.string().startsWith("usr_"),
    profile: z.object({
      firstName: z.string().min(2),
      lastName: z.string().min(2),
      birthYear: z.number().int().min(1940).max(2010),
      locale: z.string().min(4),
    }),
    contact: z.object({
      email: z.email(),
      phone: z.string().startsWith("+"),
      preferredChannel: z.enum(CHANNELS),
    }),
    addresses: z.tuple([
      z.object({
        line1: z.string().min(5),
        city: z.string().min(2),
        postalCode: z.string().min(5),
        country: z.enum(COUNTRIES),
      }),
      z.object({
        line1: z.string().min(5),
        city: z.string().min(2),
        postalCode: z.string().min(5),
        country: z.enum(COUNTRIES),
      }),
    ]),
    emergencyContacts: z.tuple([
      z.object({
        name: z.string().min(5),
        phone: z.string().startsWith("+"),
      }),
      z.object({
        name: z.string().min(5),
        phone: z.string().startsWith("+"),
      }),
    ]),
    preferences: z.object({
      newsletter: z.boolean(),
      darkMode: z.boolean(),
      tags: z.array(z.string().min(2)).min(2),
      maxItemsPerPage: z.number().int().min(10).max(100),
      timezoneOffsetMinutes: z.number(),
    }),
    security: z.object({
      mfaEnabled: z.boolean(),
      backupEmail: z.email(),
    }),
    metadata: z.object({
      source: z.literal("web"),
      campaign: z.string().min(3),
      acceptedTermsAt: z.string().datetime(),
    }),
  });

  if (!transformEnabled) {
    return schema;
  }

  return schema.transform((value) => toTransformedOutput(value as FeMediumFormInput));
}

function buildValibotSchema(transformEnabled: boolean): v.GenericSchema {
  const schema = v.object({
    userId: v.pipe(v.string(), v.startsWith("usr_")),
    profile: v.object({
      firstName: v.pipe(v.string(), v.minLength(2)),
      lastName: v.pipe(v.string(), v.minLength(2)),
      birthYear: v.pipe(v.number(), v.integer(), v.minValue(1940), v.maxValue(2010)),
      locale: v.pipe(v.string(), v.minLength(4)),
    }),
    contact: v.object({
      email: v.pipe(v.string(), v.email()),
      phone: v.pipe(v.string(), v.startsWith("+")),
      preferredChannel: v.picklist(CHANNELS),
    }),
    addresses: v.tuple([
      v.object({
        line1: v.pipe(v.string(), v.minLength(5)),
        city: v.pipe(v.string(), v.minLength(2)),
        postalCode: v.pipe(v.string(), v.minLength(5)),
        country: v.picklist(COUNTRIES),
      }),
      v.object({
        line1: v.pipe(v.string(), v.minLength(5)),
        city: v.pipe(v.string(), v.minLength(2)),
        postalCode: v.pipe(v.string(), v.minLength(5)),
        country: v.picklist(COUNTRIES),
      }),
    ]),
    emergencyContacts: v.tuple([
      v.object({
        name: v.pipe(v.string(), v.minLength(5)),
        phone: v.pipe(v.string(), v.startsWith("+")),
      }),
      v.object({
        name: v.pipe(v.string(), v.minLength(5)),
        phone: v.pipe(v.string(), v.startsWith("+")),
      }),
    ]),
    preferences: v.object({
      newsletter: v.boolean(),
      darkMode: v.boolean(),
      tags: v.pipe(v.array(v.pipe(v.string(), v.minLength(2))), v.minLength(2)),
      maxItemsPerPage: v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(100)),
      timezoneOffsetMinutes: v.number(),
    }),
    security: v.object({
      mfaEnabled: v.boolean(),
      backupEmail: v.pipe(v.string(), v.email()),
    }),
    metadata: v.object({
      source: v.literal("web"),
      campaign: v.pipe(v.string(), v.minLength(3)),
      acceptedTermsAt: v.pipe(v.string(), v.isoTimestamp()),
    }),
  });

  if (!transformEnabled) {
    return schema;
  }

  return v.pipe(
    schema,
    v.transform((value) => toTransformedOutput(value as FeMediumFormInput))
  );
}

function buildSchema(engine: BenchmarkEngine, transformEnabled: boolean): BenchmarkCase["schema"] {
  switch (engine) {
    case "zod":
      return buildZodSchema(transformEnabled);
    case "valibot":
      return buildValibotSchema(transformEnabled);
    case "core":
      return buildCoreSchema(transformEnabled);
    case "raw":
      return transformEnabled
        ? ({
            parse(input) {
              return isValidMediumForm(input) ? toTransformedOutput(input) : input;
            },
          } satisfies RawSchema)
        : ({ parse: (input) => input } satisfies RawSchema);
    default: {
      const exhaustive: never = engine;
      throw new Error(`Unhandled engine "${String(exhaustive)}".`);
    }
  }
}

function createScenario(
  name: string,
  description: string,
  transformEnabled: boolean
): BenchmarkScenario {
  return {
    name,
    description,
    supportedEngines: ["zod", "valibot", "core", "raw"],
    createCase({ engine, mode, inputSize, context }) {
      assertSupportedInputSize(inputSize);
      return {
        schema: buildSchema(engine, transformEnabled),
        inputs: buildInputs({ mode, inputSize, context }),
      };
    },
  };
}

export const feMediumFormScenario: BenchmarkScenario = createScenario(
  "fe-medium-form",
  "Frontend medium-form payload validation with latency-focused profile (parse-only).",
  false
);

export const feMediumFormTransformScenario: BenchmarkScenario = createScenario(
  "fe-medium-form-transform",
  "Frontend medium-form payload validation with parse+transform workload.",
  true
);
