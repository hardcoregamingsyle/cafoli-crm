import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
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
  const queueSummary = useMutation(api.aiMutations.queueLeadSummary);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [queuedLeads, setQueuedLeads] = useState<Set<string>>(new Set());
  const [checkedCache, setCheckedCache] = useState<Set<string>>(new Set());

  const fetchSummary = async (leadId: Id<"leads">, leadData: LeadSummaryData, recentComments?: string[], forceRegenerate = false) => {
    // Skip if already have summary, currently loading, or already queued (unless force regenerate)
    if (!forceRegenerate && (summaries[leadId] || loading[leadId] || queuedLeads.has(leadId))) return;

    // Clear existing summary if force regenerating
    if (forceRegenerate) {
      setSummaries(prev => {
        const newSummaries = { ...prev };
        delete newSummaries[leadId];
        return newSummaries;
      });
    }

    setLoading(prev => ({ ...prev, [leadId]: true }));
    setQueuedLeads(prev => new Set(prev).add(leadId));

    try {
      // Queue the summary generation in background
      const result = await queueSummary({ leadId, forceRegenerate });

      // If it was already cached, we don't need to poll for it
      if (result?.cached && !forceRegenerate) {
        setLoading(prev => ({ ...prev, [leadId]: false }));
        setQueuedLeads(prev => {
          const newSet = new Set(prev);
          newSet.delete(leadId);
          return newSet;
        });
      }

      // Note: The summary will be fetched via polling in the component
      // that uses this hook by checking getCachedSummary query
    } catch (error: any) {
      const errorMsg = error?.message || "Unknown error";
      console.error(`Failed to queue summary for lead ${leadId}:`, errorMsg, error);
      setSummaries(prev => ({ ...prev, [leadId]: `Summary unavailable: ${errorMsg}` }));
      setLoading(prev => ({ ...prev, [leadId]: false }));
      setQueuedLeads(prev => {
        const newSet = new Set(prev);
        newSet.delete(leadId);
        return newSet;
      });
    }
  };

  const updateSummary = (leadId: Id<"leads">, summary: string) => {
    setSummaries(prev => ({ ...prev, [leadId]: summary }));
    setLoading(prev => ({ ...prev, [leadId]: false }));
    setQueuedLeads(prev => {
      const newSet = new Set(prev);
      newSet.delete(leadId);
      return newSet;
    });
  };

  return {
    summaries,
    loading,
    fetchSummary,
    updateSummary,
  };
}
