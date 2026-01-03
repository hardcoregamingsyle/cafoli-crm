"use node";
import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Helper to generate HTML for PDF report
function generateReportHTML(stats: any, title: string, dateRange: string): string {
  const { overall, userStats, communicationStats } = stats;
  
  // Calculate total expenditure (assuming 0.80 INR per template/outside 24h message)
  const totalOutside24h = communicationStats.whatsappOutside24h;
  const totalExpenditure = (totalOutside24h * 0.80).toFixed(2);

  // Determine dynamic columns from overall stats
  const sourceColumns = overall.sources.map((s: any) => s.name);
  const relevancyColumns = overall.relevancy.map((s: any) => s.name);
  const statusColumns = overall.status.map((s: any) => s.name);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 11px; }
          h1 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
          h2 { color: #555; margin-top: 20px; margin-bottom: 10px; font-size: 16px; }
          .header { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          
          table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10px; }
          th, td { padding: 6px 4px; text-align: center; border: 1px solid #ddd; }
          th { background: #667eea; color: white; font-weight: bold; white-space: nowrap; }
          td:first-child { text-align: left; font-weight: bold; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          
          .comm-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-top: 20px; }
          .comm-item { background: #f0fdf4; padding: 15px; border-radius: 5px; border: 1px solid #bbf7d0; text-align: center; }
          .comm-label { font-size: 11px; color: #166534; font-weight: bold; text-transform: uppercase; }
          .comm-value { font-size: 20px; color: #14532d; margin-top: 5px; font-weight: bold; }

          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 10px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <p><strong>Period:</strong> ${dateRange}</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
        </div>

        <h2>Team Performance Report</h2>
        <div style="overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th rowspan="2">User Name</th>
                <th rowspan="2">Total Leads</th>
                <th colspan="${sourceColumns.length || 1}">Lead Sources</th>
                <th colspan="3">Follow-ups</th>
                <th colspan="${relevancyColumns.length || 1}">Relevancy</th>
                <th colspan="${statusColumns.length || 1}">Status</th>
              </tr>
              <tr>
                ${sourceColumns.length ? sourceColumns.map((s: string) => `<th>${s}</th>`).join('') : '<th>-</th>'}
                <th>Timely</th>
                <th>Overdue Done</th>
                <th>Overdue</th>
                ${relevancyColumns.length ? relevancyColumns.map((s: string) => `<th>${s}</th>`).join('') : '<th>-</th>'}
                ${statusColumns.length ? statusColumns.map((s: string) => `<th>${s}</th>`).join('') : '<th>-</th>'}
              </tr>
            </thead>
            <tbody>
              ${userStats.map((u: any) => `
                <tr>
                  <td>${u.name}</td>
                  <td>${u.leadsAssigned}</td>
                  ${sourceColumns.length ? sourceColumns.map((s: string) => `<td>${u.sources[s] || 0}</td>`).join('') : '<td>0</td>'}
                  <td>${u.punctuality["Timely-Completed"]}</td>
                  <td>${u.punctuality["Overdue-Completed"]}</td>
                  <td>${u.punctuality["Overdue"]}</td>
                  ${relevancyColumns.length ? relevancyColumns.map((s: string) => `<td>${u.relevancy[s] || 0}</td>`).join('') : '<td>0</td>'}
                  ${statusColumns.length ? statusColumns.map((s: string) => `<td>${u.status[s] || 0}</td>`).join('') : '<td>0</td>'}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <h2>Communication Statistics (Combined)</h2>
        <div class="comm-stats">
          <div class="comm-item" style="background: #eff6ff; border-color: #bfdbfe;">
            <div class="comm-label" style="color: #1e40af;">Emails Sent</div>
            <div class="comm-value" style="color: #1e3a8a;">${communicationStats.emailsSent}</div>
          </div>
          <div class="comm-item">
            <div class="comm-label">WhatsApp Sent</div>
            <div class="comm-value">${communicationStats.whatsappSent}</div>
          </div>
          <div class="comm-item">
            <div class="comm-label">WhatsApp Received</div>
            <div class="comm-value">${communicationStats.whatsappReceived}</div>
          </div>
          <div class="comm-item" style="background: #fff7ed; border-color: #fed7aa;">
            <div class="comm-label" style="color: #9a3412;">Templates (Chargeable)</div>
            <div class="comm-value" style="color: #7c2d12;">${communicationStats.whatsappTemplates}</div>
          </div>
          <div class="comm-item" style="background: #fef2f2; border-color: #fecaca;">
            <div class="comm-label" style="color: #991b1b;">Est. Cost (₹)</div>
            <div class="comm-value" style="color: #7f1d1d;">₹${totalExpenditure}</div>
          </div>
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
  args: {},
  handler: async (ctx, args) => {
    const targetEmail = "info@cafoli.in";
    console.log(`Generating test report for: "${targetEmail}"`);

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
        to: targetEmail,
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