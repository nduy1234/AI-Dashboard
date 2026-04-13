import { EventEmitter } from "node:events";

// ── Step definitions ──────────────────────────────────────────────────────────

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

export interface PipelineStepEvent {
  step: PipelineStepKey;
  label: string;
  progress: number;
  detail?: string;
  timestamp: string;
}

const STEP_META: Record<PipelineStepKey, { label: string; progress: number }> = {
  campaign_created:      { label: "Campaign Created",           progress: 12  },
  agent_initializing:    { label: "Initializing Agent",         progress: 25  },
  leads_loaded:          { label: "Leads Loaded",               progress: 38  },
  agent_running:         { label: "Agent Loop Started",         progress: 50  },
  enriching_leads:       { label: "Enriching Lead Profiles",    progress: 62  },
  generating_sequences:  { label: "Generating Email Sequences", progress: 75  },
  sending_outreach:      { label: "Dispatching Outreach",       progress: 88  },
  completed:             { label: "Pipeline Complete",          progress: 100 },
  paused:                { label: "Campaign Paused",            progress: 100 },
  failed:                { label: "Pipeline Failed",            progress: 100 },
};

// ── Emitter ───────────────────────────────────────────────────────────────────

class PipelineEmitter extends EventEmitter {
  /** Last known step per campaignId — used for reconnect replay */
  private readonly lastStep = new Map<number, PipelineStepEvent>();

  emitStep(campaignId: number, step: PipelineStepKey, detail?: string): void {
    const meta = STEP_META[step];
    const event: PipelineStepEvent = {
      step,
      label:     meta.label,
      progress:  meta.progress,
      detail,
      timestamp: new Date().toISOString(),
    };
    this.lastStep.set(campaignId, event);
    this.emit(`campaign:${campaignId}`, event);
    console.log(`[Pipeline] campaign=${campaignId} step=${step} (${meta.progress}%)`);
  }

  getLastStep(campaignId: number): PipelineStepEvent | undefined {
    return this.lastStep.get(campaignId);
  }

  clearCampaign(campaignId: number): void {
    this.lastStep.delete(campaignId);
  }
}

// Singleton — shared across the whole server process
export const pipelineEmitter = new PipelineEmitter();
// Allow many concurrent SSE subscribers without Node.js warning
pipelineEmitter.setMaxListeners(500);
