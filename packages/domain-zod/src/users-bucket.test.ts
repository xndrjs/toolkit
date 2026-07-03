import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { domain, type KitInstance, zodFromKit, zodToValidator } from "./index";

describe("UsersBucket: nested User[] is assignable to KitInstance<User>[]", () => {
  const UserModel = domain.shape(
    "User",
    zodToValidator(
      z.object({
        type: z.literal("User").default("User"),
        email: z.email(),
        username: z.string().min(1),
      })
    )
  );

  const UsersBucket = domain.shape(
    "UsersBucket",
    zodToValidator(
      z.object({
        type: z.literal("UsersBucket").default("UsersBucket"),
        users: z.array(zodFromKit(UserModel)),
      })
    )
  );

  type User = KitInstance<typeof UserModel>;

  function processUsers(users: readonly User[]): number {
    return users.reduce((sum, user) => sum + user.username.length, 0);
  }

  it("runtime: UsersBucket validates nested users via zodFromKit", () => {
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
    expectTypeOf(bucket.users).toExtend<readonly User[]>();
    expectTypeOf(users).toExtend<readonly User[]>();
    expect(users).toHaveLength(1);
  });
});
