import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { getConvexApi } from "@/lib/convex-api";

const api = getConvexApi() as any;

interface LeadSummaryData {
  name: string;
  subject: string;
  source: string;
  status?: string;
  type?: string;
  message?: string;
  lastActivity: number;
}

export function useLeadSummaries() {
  const generateSummary = useAction(api.ai.generateLeadSummary);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const fetchSummary = async (leadId: Id<"leads">, leadData: LeadSummaryData, recentComments?: string[]) => {
    if (summaries[leadId] || loading[leadId]) return;

    setLoading(prev => ({ ...prev, [leadId]: true }));

    try {
      const summary = await generateSummary({
        leadId,
        leadData,
        recentComments,
      });
      setSummaries(prev => ({ ...prev, [leadId]: summary }));
    } catch (error: any) {
      const errorMsg = error?.message || "Unknown error";
      console.error(`Failed to generate summary for lead ${leadId}:`, errorMsg, error);
      setSummaries(prev => ({ ...prev, [leadId]: `Summary unavailable: ${errorMsg}` }));
    } finally {
      setLoading(prev => ({ ...prev, [leadId]: false }));
    }
  };

  return {
    summaries,
    loading,
    fetchSummary,
  };
}
