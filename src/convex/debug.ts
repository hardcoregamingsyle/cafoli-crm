import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

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
    // Get ALL bulk contacts (2000+)
    const allContacts = await ctx.db.query("bulkContacts").take(3000);
    const replied = allContacts.filter(c => c.status === "replied");
    const sent = allContacts.filter(c => c.status === "sent");
    const cold = allContacts.filter(c => c.status === "cold");
    
    // Check how many replied contacts have corresponding leads
    let repliedWithLead = 0;
    let repliedWithoutLead = 0;
    const sampleMissingLeads: any[] = [];
    
    for (const contact of replied.slice(0, 50)) {
      const phone = contact.phoneNumber;
      const cleaned = phone.replace(/\D/g, "");
      // Leads are stored as 12-digit (91XXXXXXXXXX)
      const twelveDigit = cleaned.length === 10 ? "91" + cleaned : cleaned;
      const tenDigit = cleaned.startsWith("91") && cleaned.length === 12 ? cleaned.slice(2) : cleaned;

      let lead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", twelveDigit))
        .first();
      
      if (!lead) {
        lead = await ctx.db
          .query("leads")
          .withIndex("by_mobile", (q) => q.eq("mobile", tenDigit))
          .first();
      }
      
      if (!lead) {
        lead = await ctx.db
          .query("leads")
          .withIndex("by_mobile", (q) => q.eq("mobile", phone))
          .first();
      }
      
      if (lead) {
        repliedWithLead++;
      } else {
        repliedWithoutLead++;
        if (sampleMissingLeads.length < 5) {
          sampleMissingLeads.push({ phone: contact.phoneNumber, name: contact.name });
        }
      }
    }
    
    // Check sent contacts for leads (using correct 12-digit format)
    let sentWithLead = 0;
    for (const contact of sent.slice(0, 50)) {
      const phone = contact.phoneNumber;
      const cleaned = phone.replace(/\D/g, "");
      const twelveDigit = cleaned.length === 10 ? "91" + cleaned : cleaned;
      
      let lead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", twelveDigit))
        .first();
      
      if (!lead) {
        lead = await ctx.db
          .query("leads")
          .withIndex("by_mobile", (q) => q.eq("mobile", phone))
          .first();
      }
      
      if (lead) sentWithLead++;
    }
    
    return {
      total: allContacts.length,
      replied: replied.length,
      sent: sent.length,
      cold: cold.length,
      repliedWithLead,
      repliedWithoutLead,
      sampleMissingLeads,
      sentWithLeadSample: `${sentWithLead}/50 of sent contacts have leads (checked as 12-digit)`,
      note: "Leads are stored as 12-digit (91XXXXXXXXXX), bulk contacts stored as 10-digit",
    };
  },
});

export const inspectBulkContactPhones = internalQuery({
  args: {},
  handler: async (ctx) => {
    const contacts = await ctx.db
      .query("bulkContacts")
      .withIndex("by_sentAt")
      .order("desc")
      .take(10);
    
    return contacts.map(c => ({
      phoneNumber: c.phoneNumber,
      phoneLength: c.phoneNumber?.length,
      name: c.name,
      status: c.status,
    }));
  },
});

export const recoverBulkContactReplies = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all bulk contacts (up to 3000)
    const allContacts = await ctx.db
      .query("bulkContacts")
      .withIndex("by_sentAt")
      .order("desc")
      .take(3000);

    let matched = 0;
    let created = 0;
    let alreadyReplied = 0;

    for (const contact of allContacts) {
      if (contact.status === "replied") {
        alreadyReplied++;
        continue;
      }

      const phone = contact.phoneNumber;
      const cleaned = phone.replace(/\D/g, "");
      
      // Build all possible formats — leads stored as 12-digit
      const formats = [
        phone,
        cleaned,
        cleaned.length === 10 ? "91" + cleaned : null,
        cleaned.startsWith("91") && cleaned.length === 12 ? cleaned.slice(2) : null,
        "+" + cleaned,
      ].filter(Boolean) as string[];

      let foundLead = null;
      for (const fmt of formats) {
        const lead = await ctx.db
          .query("leads")
          .withIndex("by_mobile", (q) => q.eq("mobile", fmt))
          .first();
        if (lead) {
          foundLead = lead;
          break;
        }
      }

      if (foundLead) {
        await ctx.db.patch(contact._id, {
          status: "replied",
          lastInteractionAt: Date.now(),
        });
        matched++;
      } else {
        // No lead found — create one so this high-quality lead is not lost
        const standardized = cleaned.length === 10 ? "91" + cleaned : cleaned;
        if (standardized.length >= 10) {
          await ctx.db.insert("leads", {
            name: contact.name || `Bulk Contact ${standardized}`,
            mobile: standardized,
            source: "Bulk Campaign Reply",
            status: "Cold",
            type: "To be Decided",
            lastActivity: Date.now(),
            priorityScore: 50,
            adminAssignmentRequired: true,
          });
          await ctx.db.patch(contact._id, {
            status: "replied",
            lastInteractionAt: Date.now(),
          });
          created++;
        }
      }
    }

    return { matched, created, alreadyReplied, total: allContacts.length };
  },
});

export const getBulkContactsStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Get total leads in system
    const totalLeads = await ctx.db.query("leads").take(5000);
    const bulkCampaignLeads = totalLeads.filter(l => l.source === "Bulk Campaign Reply");
    const whatsappLeads = totalLeads.filter(l => l.source === "WhatsApp");
    
    // Get bulk contacts breakdown (up to 3000)
    const bulkContacts = await ctx.db.query("bulkContacts").take(3000);
    const replied = bulkContacts.filter(c => c.status === "replied");
    const sent = bulkContacts.filter(c => c.status === "sent");
    
    return {
      totalLeadsInSystem: totalLeads.length,
      bulkCampaignLeads: bulkCampaignLeads.length,
      whatsappLeads: whatsappLeads.length,
      totalBulkContactsTracked: bulkContacts.length,
      repliedBulkContacts: replied.length,
      sentBulkContacts: sent.length,
      note: `If totalBulkContactsTracked < 2100, some sends were not tracked in DB. Currently tracking ${bulkContacts.length}/2100 expected.`,
    };
  },
});