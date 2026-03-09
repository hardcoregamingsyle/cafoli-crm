import { internalMutation, internalQuery } from "./_generated/server";

export const checkHashFormat = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.db.query("users").first();
    if (user && user.passwordHash) {
      console.log("DEBUG: Found password:", user.passwordHash);
      return user.passwordHash;
    } else {
      console.log("DEBUG: No user with password found");
      return null;
    }
  },
});

export const resetAllPasswords = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const password1234 = "1234";
    const passwordOwner = "Belive*8";

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

export const checkCorruptedLeads = internalQuery({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    const corrupted = leads.filter(l => !l.mobile || l.mobile.length < 10 || l.mobile.includes("+") || l.mobile.includes(" ") || l.mobile.includes("-"));
    return {
      total: leads.length,
      corruptedCount: corrupted.length,
      sample: corrupted.slice(0, 10)
    };
  }
});
