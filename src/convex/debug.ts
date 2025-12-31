import { internalMutation, internalQuery } from "./_generated/server";
import { hashPassword } from "./lib/passwordUtils";

export const checkHashFormat = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db.query("users").first();
    if (user && user.passwordHash) {
      console.log("DEBUG: Found password hash:", user.passwordHash);
      return user.passwordHash;
    } else {
      console.log("DEBUG: No user with password hash found");
      return null;
    }
  },
});

export const resetAllPasswords = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const password1234 = await hashPassword("1234");
    const passwordOwner = await hashPassword("Belive*8");

    let count = 0;
    for (const user of users) {
      if (user.email?.toLowerCase() === "owner") {
        await ctx.db.patch(user._id, { passwordHash: passwordOwner });
      } else {
        await ctx.db.patch(user._id, { passwordHash: password1234 });
      }
      count++;
    }
    return `Updated passwords for ${count} users`;
  },
});