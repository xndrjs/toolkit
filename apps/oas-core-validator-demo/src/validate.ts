import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DomainValidationError,
  domain,
  openApiComponentToValidator,
  pipe,
} from "@xndrjs/domain-ajv";
import type { components } from "./generated/openapi.types.js";
import type { OpenApiBundle } from "@xndrjs/domain-ajv";

type UserDTO = components["schemas"]["User"];
type TierDTO = components["schemas"]["Tier"];

async function getBundle() {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const bundledPath = path.join(appRoot, "src", "generated", "openapi.bundled.json");
  const bundled = JSON.parse(await readFile(bundledPath, "utf8")) as OpenApiBundle;
  if (
    !bundled.components?.schemas?.User ||
    !bundled.components.schemas.VerifiedUser ||
    !bundled.components.schemas.Tier
  ) {
    throw new Error(
      'Expected "User", "VerifiedUser" and "Tier" schemas in bundled OpenAPI components'
    );
  }
  return bundled;
}

const validPayload: UserDTO = {
  id: "u-1",
  email: "dev@example.com",
  tier: "pro",
  isVerified: true,
  tags: ["alpha", "beta"],
};

const invalidPayload = {
  id: "",
  email: "not-an-email",
  tier: "enterprise",
  isVerified: "yes",
  tags: [""],
};

function printValidationError(error: unknown) {
  if (error instanceof DomainValidationError) {
    console.log("Domain validation failed:");
    for (const issue of error.failure.issues) {
      console.log(`- [${issue.code}] ${issue.path.join(".") || "<root>"}: ${issue.message}`);
    }
    return;
  }
  console.error("Unexpected error:", error);
}

async function main() {
  const bundle = await getBundle();

  const Tier = domain.primitive("Tier", openApiComponentToValidator<TierDTO>(bundle, "Tier"));
  const User = domain.shape("User", openApiComponentToValidator<UserDTO>(bundle, "User"));
  const VerifiedUser = domain
    .proof("VerifiedUser", openApiComponentToValidator<UserDTO>(bundle, "VerifiedUser"))
    .refineType((value): value is typeof value & { isVerified: true } => value.isVerified === true);

  try {
    const tier = Tier.create(validPayload.tier);
    console.log("Valid tier accepted:", tier);
  } catch (error) {
    printValidationError(error);
  }

  try {
    Tier.create("enterprise" as unknown as TierDTO);
    console.log("Invalid tier unexpectedly accepted");
  } catch (error) {
    printValidationError(error);
  }

  try {
    const user = User.create(validPayload);
    const verifiedUser = pipe(user, VerifiedUser.assert);
    console.log("Valid payload accepted:", verifiedUser);
  } catch (error) {
    printValidationError(error);
  }

  try {
    User.create(invalidPayload as unknown as UserDTO);
    console.log("Invalid payload unexpectedly accepted");
  } catch (error) {
    printValidationError(error);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
