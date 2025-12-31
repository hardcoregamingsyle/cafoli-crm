"use node";

import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { hashPassword, verifyPassword } from "../lib/passwordUtils";
import { Password } from "@convex-dev/auth/providers/Password";
import { DataModel } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { mutation } from "../_generated/server";
import { v } from "convex/values";

// Hardcoded credentials storage (in-memory for this implementation)
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

    // Check against hardcoded credentials first
    const hardcodedUser = HARDCODED_USERS.find(
      u => u.username === username && u.password === password
    );

    if (hardcodedUser) {
      // Check if user exists in database
      let user: { _id: Id<"users">; role?: string; passwordHash?: string } | null = await ctx.runQuery(internal.users.getUserByEmail, { email: username });

      // Create user if doesn't exist OR update role if it's not admin
      if (!user) {
        const passwordHash = hashPassword(hardcodedUser.password);
        const userId = await ctx.runMutation(internal.users.createUserWithRole, {
          email: username,
          name: hardcodedUser.name,
          role: hardcodedUser.role,
          passwordHash,
        });
        user = { _id: userId, role: hardcodedUser.role, passwordHash };
      } else if (user.role !== "admin") {
        // Ensure the owner account always has admin role
        await ctx.runMutation(internal.users.updateUserRole, {
          userId: user._id,
          role: "admin",
        });
        user = { ...user, role: "admin" };
      }

      return { userId: user._id };
    }

    // Check against dynamic users (created by admin)
    const dbUser = await ctx.runQuery(internal.users.getUserByEmail, { email: username });
    
    if (dbUser && dbUser.passwordHash) {
      // Verify password using hash
      if (verifyPassword(password, dbUser.passwordHash)) {
        return { userId: dbUser._id };
      }
    }

    return null;
  },
});

export const PasswordProvider = Password<DataModel>({
  profile(params) {
    return {
      email: params.email as string,
      name: params.name as string,
    };
  },
});

export const { auth, signIn, signOut, store } = PasswordProvider;