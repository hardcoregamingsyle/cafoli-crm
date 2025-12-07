import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, QueryCtx, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

export const ensureRole = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const user = await ctx.db.get(userId);
    if (user && !user.role) {
      // Check if username is "owner" (case insensitive)
      const isOwner = user.email?.toLowerCase() === "owner";
      
      await ctx.db.patch(userId, {
        role: isOwner ? ROLES.ADMIN : ROLES.STAFF,
      });
    }
  },
});

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const createUserWithRole = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      role: args.role as "admin" | "staff",
    });
  },
});

export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    
    const currentUser = await ctx.db.get(userId);
    // Only admins can see all users
    if (currentUser?.role !== ROLES.ADMIN) return [];
    
    return await ctx.db.query("users").collect();
  },
});

export const createUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    password: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    
    const currentUser = await ctx.db.get(userId);
    if (currentUser?.role !== ROLES.ADMIN) {
      throw new Error("Only admins can create users");
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Create user in database
    const newUserId = await ctx.db.insert("users", {
      email: args.email.toLowerCase(),
      name: args.name,
      role: args.role as "admin" | "staff",
    });

    return newUserId;
  },
});

export const deleteUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) throw new Error("Unauthorized");
    
    const currentUser = await ctx.db.get(currentUserId);
    if (currentUser?.role !== ROLES.ADMIN) {
      throw new Error("Only admins can delete users");
    }

    // Prevent deleting yourself
    if (currentUserId === args.userId) {
      throw new Error("Cannot delete your own account");
    }

    // Check if user is the owner
    const userToDelete = await ctx.db.get(args.userId);
    if (userToDelete?.email?.toLowerCase() === "owner") {
      throw new Error("Cannot delete the owner account");
    }

    await ctx.db.delete(args.userId);
  },
});