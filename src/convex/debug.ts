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

export const deleteCorruptedLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    const corrupted = leads.filter(l => !l.mobile || l.mobile.length < 10 || l.mobile.includes("+") || l.mobile.includes(" ") || l.mobile.includes("-"));
    
    let deleted = 0;
    for (const lead of corrupted) {
      // Only delete if name is also junk (like "*")
      if (!lead.name || lead.name === "*" || lead.name.trim() === "") {
        await ctx.db.delete(lead._id);
        deleted++;
      }
    }
    return { deleted, total: corrupted.length };
  }
});

export const checkBulkContactsStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const total = await ctx.db.query("bulkContacts").take(1000);
    const replied = total.filter(c => c.status === "replied");
    const sent = total.filter(c => c.status === "sent");
    const cold = total.filter(c => c.status === "cold");
    
    // Check how many replied contacts have corresponding leads
    let repliedWithLead = 0;
    let repliedWithoutLead = 0;
    const sampleMissingLeads: any[] = [];
    
    for (const contact of replied.slice(0, 50)) {
      const lead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", contact.phoneNumber))
        .first();
      
      if (lead) {
        repliedWithLead++;
      } else {
        repliedWithoutLead++;
        if (sampleMissingLeads.length < 5) {
          sampleMissingLeads.push({ phone: contact.phoneNumber, name: contact.name });
        }
      }
    }
    
    return {
      total: total.length,
      replied: replied.length,
      sent: sent.length,
      cold: cold.length,
      repliedWithLead,
      repliedWithoutLead,
      sampleMissingLeads,
    };
  },
});