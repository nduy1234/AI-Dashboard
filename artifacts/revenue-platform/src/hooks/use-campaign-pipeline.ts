import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineStepKey =
  | "campaign_created"
  | "agent_initializing"
  | "leads_loaded"
  | "agent_running"
  | "enriching_leads"
  | "generating_sequences"
  | "sending_outreach"
  | "completed"
  | "paused"
  | "failed";

export type PipelineStatus =
  | "idle"
  | "connecting"
  | "running"
  | "completed"
  | "paused"
  | "failed"
  | "error";

export interface PipelineStep {
  step: PipelineStepKey;
  label: string;
  progress: number;
  detail?: string;
  timestamp: string;
}

export interface StepMeta {
  key: PipelineStepKey;
  label: string;
}

// Ordered list of all pipeline steps (terminal steps share the last slot)
export const ALL_PIPELINE_STEPS: StepMeta[] = [
  { key: "campaign_created",     label: "Campaign Created"           },
  { key: "agent_initializing",   label: "Initializing Agent"         },
  { key: "leads_loaded",         label: "Leads Loaded"               },
  { key: "agent_running",        label: "Agent Loop Started"         },
  { key: "enriching_leads",      label: "Enriching Lead Profiles"    },
  { key: "generating_sequences", label: "Generating Email Sequences" },
  { key: "sending_outreach",     label: "Dispatching Outreach"       },
  { key: "completed",            label: "Pipeline Complete"          },
];

const TERMINAL_KEYS: PipelineStepKey[] = ["completed", "paused", "failed"];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3_000;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCampaignPipeline(campaignId: number | null) {
  const [steps, setSteps]         = useState<PipelineStep[]>([]);
  const [progress, setProgress]   = useState(0);
  const [status, setStatus]       = useState<PipelineStatus>("idle");
  const [isConnected, setIsConnected] = useState(false);

  const esRef      = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);

  const connect = useCallback(() => {
    if (!campaignId) return;

    // Close any existing connection
    esRef.current?.close();
    esRef.current = null;

    setStatus("connecting");

    const es = new EventSource(
      `/api/v1/campaigns/${campaignId}/pipeline-progress`,
      { withCredentials: true },
    );
    esRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      retriesRef.current = 0;
    };

    es.onmessage = (e: MessageEvent) => {
      try {
        const event: PipelineStep = JSON.parse(e.data as string);

        setSteps((prev) => {
          // Deduplicate — don't push the same step key twice
          if (prev.some((s) => s.step === event.step)) return prev;
          return [...prev, event];
        });
        setProgress(event.progress);

        if (TERMINAL_KEYS.includes(event.step)) {
          setStatus(event.step as PipelineStatus);
          es.close();
          esRef.current = null;
          setIsConnected(false);
        } else {
          setStatus("running");
        }
      } catch {
        // ignore JSON parse errors from heartbeat comments
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      esRef.current = null;

      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current += 1;
        setTimeout(connect, RETRY_DELAY_MS);
      } else {
        setStatus("error");
      }
    };
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) {
      // Reset state when no campaign is being watched
      esRef.current?.close();
      esRef.current  = null;
      setSteps([]);
      setProgress(0);
      setStatus("idle");
      setIsConnected(false);
      retriesRef.current = 0;
      return;
    }

    // Reset and (re)connect whenever campaignId changes
    setSteps([]);
    setProgress(0);
    retriesRef.current = 0;
    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [campaignId, connect]);

  const currentStep = steps.length > 0 ? steps[steps.length - 1].step : null;

  return { steps, progress, status, isConnected, currentStep, allSteps: ALL_PIPELINE_STEPS };
}
