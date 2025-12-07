import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// Hardcoded credentials
const HARDCODED_USERS = [
  {
    username: "owner",
    password: "Belive*8",
    role: "admin",
    name: "Owner"
  }
];

export const password = ConvexCredentials({
  id: "password",
  authorize: async (credentials, ctx): Promise<{ userId: Id<"users"> } | null> => {
    const username = (credentials.email as string)?.toLowerCase();
    const password = credentials.password as string;

    // Check against hardcoded credentials
    const hardcodedUser = HARDCODED_USERS.find(
      u => u.username === username && u.password === password
    );

    if (!hardcodedUser) {
      return null;
    }

    // Check if user exists in database
    let user: { _id: Id<"users"> } | null = await ctx.runQuery(internal.users.getUserByEmail, { email: username });

    // Create user if doesn't exist
    if (!user) {
      const userId = await ctx.runMutation(internal.users.createUserWithRole, {
        email: username,
        name: hardcodedUser.name,
        role: hardcodedUser.role,
      });
      user = { _id: userId };
    }

    if (!user) {
      return null;
    }

    return { userId: user._id };
  },
});


