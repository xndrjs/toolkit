import { domain } from "@xndrjs/domain";

import { UserShape } from "../shapes/user.shape.js";

export const User = domain.capabilities
  .forShape<{ displayName: string; isVerified: boolean }>()
  .methods(({ patch }) => ({
    rename(user, displayName: string) {
      return patch(user, { displayName });
    },
    verify(user) {
      return patch(user, { isVerified: true });
    },
  }))
  .attach(UserShape);
