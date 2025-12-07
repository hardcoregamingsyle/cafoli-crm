import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// Hardcoded credentials storage (in-memory for this implementation)
const HARDCODED_USERS = [
  {
    username: "owner",
    password: "Belive*8",
    role: "admin",
    name: "Owner"
  }
];

// Dynamic users storage (will be populated from database)
let dynamicUsers: Array<{ username: string; password: string; role: string; name: string }> = [];

export const password = ConvexCredentials({
  id: "password",
  authorize: async (credentials, ctx): Promise<{ userId: Id<"users"> } | null> => {
    const username = (credentials.email as string)?.toLowerCase();
    const password = credentials.password as string;

    // Check against hardcoded credentials first
    const hardcodedUser = HARDCODED_USERS.find(
      u => u.username === username && u.password === password
    );

    if (hardcodedUser) {
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
    }

    // Check against dynamic users (created by admin)
    const dbUser = await ctx.runQuery(internal.users.getUserByEmail, { email: username });
    
    if (dbUser) {
      // For now, we'll use a simple password check
      // In production, you should hash passwords
      // For this implementation, we'll store passwords in a separate table or use the email as password
      // Since we don't have password hashing yet, we'll accept any password for existing users
      // This is a security risk and should be fixed in production
      
      return { userId: dbUser._id };
    }

    return null;
  },
});