import { describe, expect, expectTypeOf, it } from "vitest";
import * as v from "valibot";

import { domain, type KitInstance, valibotFromKit, valibotToValidator } from "./index";

describe("UsersBucket: nested User[] is assignable to KitInstance<User>[]", () => {
  const UserModel = domain.shape(
    "User",
    valibotToValidator(
      v.object({
        type: v.optional(v.literal("User"), "User"),
        email: v.pipe(v.string(), v.email()),
        username: v.pipe(v.string(), v.minLength(1)),
      })
    )
  );

  const UsersBucket = domain.shape(
    "UsersBucket",
    valibotToValidator(
      v.object({
        type: v.optional(v.literal("UsersBucket"), "UsersBucket"),
        users: v.array(valibotFromKit(UserModel)),
      })
    )
  );

  type User = KitInstance<typeof UserModel>;

  function processUsers(users: User[]): number {
    return users.reduce((sum, user) => sum + user.username.length, 0);
  }

  it("runtime: UsersBucket validates nested users via valibotFromKit", () => {
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

    const users: User[] = bucket.users;
    expectTypeOf(bucket.users).toExtend<User[]>();
    expectTypeOf(users).toExtend<User[]>();
    expect(users).toHaveLength(1);
  });
});
