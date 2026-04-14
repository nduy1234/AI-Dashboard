import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE = "/api/v1";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ScanFilters {
  inactivityDays: number;
  dealStage?: string;
  minDealValue?: number;
}

export interface ScanProgressEvent {
  jobId: number;
  status: "queued" | "running" | "completed" | "failed";
  totalFound: number;
  imported: number;
  duplicates: number;
  excluded: number;
  progress: number;
  error?: string;
}

export interface SequenceStep {
  stepNumber: number;
  delayDays: number;
  subject: string;
  body: string;
}

export interface CreateCampaignPayload {
  name: string;
  leadIds: number[];
  steps: SequenceStep[];
  channel?: string;
}

export interface ReactivationSettings {
  dailyOutreachLimit: number;
  safetyMode: boolean;
  dailyOutreachToday: number;
  hubspotStatus: string;
  hubspotPortalId: number | null;
}

// ── HubSpot connect ────────────────────────────────────────────────────────────

export function useConnectHubspot() {
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await fetch(`${API_BASE}/integrations/hubspot/connect`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "HubSpot connection failed");
      return json as { ok: boolean; portalId: number; hubDomain: string };
    },
  });
}

// ── Scan trigger ───────────────────────────────────────────────────────────────

export function useTriggerScan() {
  return useMutation({
    mutationFn: async (filters: ScanFilters) => {
      const res = await fetch(`${API_BASE}/reactivation/scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to start scan");
      return json as { ok: boolean; jobId: number; status: string };
    },
  });
}

// ── SSE scan progress ──────────────────────────────────────────────────────────

export function useScanProgress(jobId: number | null) {
  const [progress, setProgress] = useState<ScanProgressEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // Close any existing connection
    esRef.current?.close();

    const es = new EventSource(`${API_BASE}/reactivation/scan/${jobId}/progress`, { withCredentials: true });
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ScanProgressEvent;
        setProgress(data);
        if (data.status === "completed" || data.status === "failed") {
          es.close();
          esRef.current = null;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [jobId]);

  return progress;
}

// ── Create campaign ────────────────────────────────────────────────────────────

export function useCreateReactivationCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateCampaignPayload) => {
      const res = await fetch(`${API_BASE}/reactivation/campaigns`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create campaign");
      return json as { ok: boolean; campaignId: number; leadsCount: number; stepsCount: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

// ── Launch campaign ────────────────────────────────────────────────────────────

export function useLaunchReactivationCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: number) => {
      const res = await fetch(`${API_BASE}/reactivation/campaigns/${campaignId}/launch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to launch campaign");
      return json as { ok: boolean; campaignId: number; queuedEmails: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

// ── Campaign execution status ──────────────────────────────────────────────────

export function useCampaignExecutionStatus(campaignId: number | null) {
  return useQuery({
    queryKey: ["reactivation-campaign-status", campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const res = await fetch(`${API_BASE}/reactivation/campaigns/${campaignId}/status`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch campaign status");
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: 30000, // poll every 30s
  });
}

// ── Settings ───────────────────────────────────────────────────────────────────

export function useReactivationSettings() {
  return useQuery<ReactivationSettings>({
    queryKey: ["reactivation-settings"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/reactivation/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    staleTime: 60000,
  });
}

export function useUpdateReactivationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: { dailyOutreachLimit?: number; safetyMode?: boolean }) => {
      const res = await fetch(`${API_BASE}/reactivation/settings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update settings");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reactivation-settings"] });
    },
  });
}
