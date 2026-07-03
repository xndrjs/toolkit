import { describe, expect, expectTypeOf, it } from "vitest";

import { compose, domain, type KitInstance } from "./index";
import type { ShapeInstance, ShapeKitCore } from "./shape";
import type { ValidationResult, Validator } from "./validation";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function fail(message: string, code = "invalid") {
  return {
    success: false as const,
    error: {
      engine: "test",
      issues: [{ code, path: [] as const, message }],
    },
  };
}

const emailValidator: Validator<string, string> = {
  engine: "test",
  validate(input) {
    if (typeof input !== "string" || !EMAIL_RE.test(input)) {
      return fail("Invalid email", "invalid_email");
    }
    return { success: true, data: input };
  },
};

const usernameValidator: Validator<string, string> = {
  engine: "test",
  validate(input) {
    if (typeof input !== "string" || input.length === 0) {
      return fail("Invalid username", "invalid_username");
    }
    return { success: true, data: input };
  },
};

const userTypeValidator: Validator<"User" | undefined, "User"> = {
  engine: "test",
  validate(input) {
    if (input === undefined || input === "User") {
      return { success: true, data: "User" };
    }
    return fail('Expected type "User"', "invalid_type");
  },
};

const usersBucketTypeValidator: Validator<"UsersBucket" | undefined, "UsersBucket"> = {
  engine: "test",
  validate(input) {
    if (input === undefined || input === "UsersBucket") {
      return { success: true, data: "UsersBucket" };
    }
    return fail('Expected type "UsersBucket"', "invalid_type");
  },
};

function validatorFromKit<Type extends string, Input extends object, Props extends object>(
  kit: ShapeKitCore<Type, Input, Props>
): Validator<unknown, ShapeInstance<Type, Props>> {
  return {
    engine: kit.validator.engine,
    validate(input: unknown): ValidationResult<ShapeInstance<Type, Props>> {
      if (kit.is(input)) {
        return { success: true, data: input };
      }
      return kit.safeCreate(input as Input);
    },
  };
}

describe("UsersBucket: nested User[] is assignable to KitInstance<User>[]", () => {
  const UserModel = domain.shape(
    "User",
    compose.object({
      type: userTypeValidator,
      email: emailValidator,
      username: usernameValidator,
    })
  );

  const UsersBucket = domain.shape(
    "UsersBucket",
    compose.object({
      type: usersBucketTypeValidator,
      users: compose.array(validatorFromKit(UserModel)),
    })
  );

  type User = KitInstance<typeof UserModel>;

  function processUsers(users: readonly User[]): number {
    return users.reduce((sum, user) => sum + user.username.length, 0);
  }

  it("runtime: UsersBucket validates nested users via validatorFromKit", () => {
    const bucket = UsersBucket.create({
      users: [
        { email: "alice@example.com", username: "alice" },
        { email: "bob@example.com", username: "bob" },
      ],
    });

    expect(bucket.type).toBe("UsersBucket");
    expect(bucket.users).toHaveLength(2);
    expect(UserModel.is(bucket.users[0]!)).toBe(true);
    expect(UserModel.is(bucket.users[1]!)).toBe(true);
    expect(Object.isFrozen(bucket)).toBe(true);
    expect(Object.isFrozen(bucket.users[0]!)).toBe(true);
  });

  it("runtime: processUsers accepts usersBucket.users", () => {
    const bucket = UsersBucket.create({
      users: [
        { email: "ada@example.com", username: "ada" },
        { email: "grace@example.com", username: "grace" },
      ],
    });

    expect(processUsers(bucket.users)).toBe(8);
  });

  it("type: usersBucket.users is assignable to User[]", () => {
    const bucket = UsersBucket.create({
      users: [{ email: "a@b.co", username: "ab" }],
    });

    const users: readonly User[] = bucket.users;
    expectTypeOf(bucket.users).toEqualTypeOf<readonly User[]>();
    expectTypeOf(users).toEqualTypeOf<readonly User[]>();
    expect(users).toHaveLength(1);
  });
});
