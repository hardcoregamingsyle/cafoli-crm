"use node";
import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Helper to generate HTML for PDF report
function generateReportHTML(stats: any, title: string, dateRange: string): string {
  const { overall, userStats } = stats;
  
  // Calculate total expenditure (assuming 0.80 INR per template/outside 24h message)
  const totalOutside24h = userStats.reduce((acc: number, curr: any) => acc + curr.whatsappOutside24h, 0);
  const totalExpenditure = (totalOutside24h * 0.80).toFixed(2);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
          h2 { color: #555; margin-top: 20px; margin-bottom: 10px; font-size: 18px; }
          .header { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
          .summary-item { background: #f9f9f9; padding: 10px; border-radius: 5px; border: 1px solid #eee; }
          .summary-label { font-weight: bold; color: #667eea; font-size: 12px; text-transform: uppercase; }
          .summary-value { font-size: 18px; color: #333; margin-top: 5px; }
          .compact-list { list-style: none; padding: 0; margin: 0; font-size: 13px; }
          .compact-list li { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dashed #eee; }
          
          table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 12px; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #667eea; color: white; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <p><strong>Period:</strong> ${dateRange}</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
        </div>

        <h2>Overall Summary</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">Total Leads</div>
            <div class="summary-value">${overall.totalLeads}</div>
          </div>
          
          <div class="summary-item">
            <div class="summary-label">Sources</div>
            <ul class="compact-list">
              ${overall.sources.map((s: any) => `<li><span>${s.name}</span> <span>${s.count}</span></li>`).join('')}
            </ul>
          </div>

          <div class="summary-item">
            <div class="summary-label">Status</div>
            <ul class="compact-list">
              ${overall.status.map((s: any) => `<li><span>${s.name}</span> <span>${s.count}</span></li>`).join('')}
            </ul>
          </div>

          <div class="summary-item">
            <div class="summary-label">Relevancy</div>
            <ul class="compact-list">
              ${overall.relevancy.map((s: any) => `<li><span>${s.name}</span> <span>${s.count}</span></li>`).join('')}
            </ul>
          </div>
          
          <div class="summary-item">
            <div class="summary-label">Assignment</div>
            <ul class="compact-list">
              ${overall.assignment.slice(0, 5).map((s: any) => `<li><span>${s.name}</span> <span>${s.count}</span></li>`).join('')}
              ${overall.assignment.length > 5 ? `<li><span>Others</span> <span>${overall.assignment.slice(5).reduce((a:any, b:any) => a + b.count, 0)}</span></li>` : ''}
            </ul>
          </div>

          <div class="summary-item">
            <div class="summary-label">Follow-up Punctuality</div>
            <ul class="compact-list">
              ${overall.punctuality.map((s: any) => `<li><span>${s.name}</span> <span>${s.count}</span></li>`).join('')}
            </ul>
          </div>
        </div>

        <h2>Team Performance & Activity</h2>
        <table>
          <thead>
            <tr>
              <th>User Name</th>
              <th>Emails Sent</th>
              <th>WA Sent</th>
              <th>WA Received</th>
              <th>WA Templates</th>
              <th>WA Outside 24h</th>
            </tr>
          </thead>
          <tbody>
            ${userStats.map((u: any) => `
              <tr>
                <td>${u.name}</td>
                <td>${u.emailsSent}</td>
                <td>${u.whatsappSent}</td>
                <td>${u.whatsappReceived}</td>
                <td>${u.whatsappTemplates}</td>
                <td>${u.whatsappOutside24h}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="margin-top: 20px; padding: 15px; background: #eef2ff; border-radius: 5px; border: 1px solid #c7d2fe;">
          <h3 style="margin: 0 0 10px 0; color: #4338ca;">Estimated WhatsApp Expenditure</h3>
          <p style="margin: 0; font-size: 14px;">
            Total Outside 24h Messages: <strong>${totalOutside24h}</strong><br/>
            Estimated Cost (₹0.80/msg): <strong>₹${totalExpenditure}</strong>
          </p>
        </div>

        <div class="footer">
          <p>© ${new Date().getFullYear()} Cafoli Connect CRM - Automated Report</p>
        </div>
      </body>
    </html>
  `;
}

export const sendScheduledReports = internalAction({
  args: {
    reportType: v.string(), // "daily", "weekly", "monthly", "quarterly", "yearly"
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let startDate: number;
    let dateRangeLabel: string;

    // Calculate date range based on report type
    switch (args.reportType) {
      case "daily":
        startDate = now - 24 * 60 * 60 * 1000; // Last 24 hours
        dateRangeLabel = new Date(startDate).toLocaleDateString('en-IN') + " - " + new Date(now).toLocaleDateString('en-IN');
        break;
      case "weekly":
        startDate = now - 7 * 24 * 60 * 60 * 1000; // Last 7 days
        dateRangeLabel = "Week of " + new Date(startDate).toLocaleDateString('en-IN');
        break;
      case "monthly":
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        lastMonth.setDate(1);
        startDate = lastMonth.getTime();
        dateRangeLabel = lastMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        break;
      case "quarterly":
        const lastQuarter = new Date(now);
        lastQuarter.setMonth(lastQuarter.getMonth() - 3);
        startDate = lastQuarter.getTime();
        dateRangeLabel = "Quarter ending " + new Date(now).toLocaleDateString('en-IN');
        break;
      case "yearly":
        const lastYear = new Date(now);
        lastYear.setFullYear(lastYear.getFullYear() - 1);
        lastYear.setMonth(0);
        lastYear.setDate(1);
        startDate = lastYear.getTime();
        dateRangeLabel = lastYear.getFullYear().toString();
        break;
      default:
        throw new Error("Invalid report type");
    }

    // Generate detailed report
    const stats = await ctx.runQuery(internal.reports.getDetailedReportStats, {
      startDate,
      endDate: now,
    });

    if (!stats) {
      console.error("Failed to generate stats");
      return { success: false, error: "Failed to generate stats" };
    }

    const html = generateReportHTML(
      stats,
      `Cafoli Connect - ${args.reportType.charAt(0).toUpperCase() + args.reportType.slice(1)} Report`,
      dateRangeLabel
    );

    // Send email using Brevo
    try {
      await ctx.runAction(internal.brevo.sendEmailInternal, {
        to: "info@cafoli.in",
        toName: "Cafoli Admin",
        subject: `Cafoli CRM - ${args.reportType.charAt(0).toUpperCase() + args.reportType.slice(1)} Report - ${dateRangeLabel}`,
        htmlContent: html,
      });

      console.log(`${args.reportType} report sent successfully`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to send ${args.reportType} report:`, error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

export const sendTestReport = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const startDate = now - 24 * 60 * 60 * 1000; // Last 24 hours for test
    const dateRangeLabel = "TEST REPORT (Last 24h)";

    const stats = await ctx.runQuery(internal.reports.getDetailedReportStats, {
      startDate,
      endDate: now,
    });

    if (!stats) {
      return { success: false, error: "Failed to generate stats" };
    }

    const html = generateReportHTML(
      stats,
      "Cafoli Connect - Test Report",
      dateRangeLabel
    );

    try {
      await ctx.runAction(internal.brevo.sendEmailInternal, {
        to: args.email,
        toName: "Admin",
        subject: `Cafoli CRM - Test Report - ${dateRangeLabel}`,
        htmlContent: html,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});