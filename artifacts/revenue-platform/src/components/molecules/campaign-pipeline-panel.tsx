import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Rocket,
  Bot,
  Users,
  Zap,
  SearchIcon,
  Mail,
  Send,
  Sparkles,
  Activity,
  ArrowRight,
  PauseCircle,
} from "lucide-react";
import {
  useCampaignPipeline,
  ALL_PIPELINE_STEPS,
  type PipelineStepKey,
  type PipelineStatus,
} from "@/hooks/use-campaign-pipeline";

// ── Icons per step ────────────────────────────────────────────────────────────

const STEP_ICON: Record<PipelineStepKey, React.ComponentType<{ className?: string }>> = {
  campaign_created:     Rocket,
  agent_initializing:   Bot,
  leads_loaded:         Users,
  agent_running:        Zap,
  enriching_leads:      SearchIcon,
  generating_sequences: Mail,
  sending_outreach:     Send,
  completed:            Sparkles,
  paused:               PauseCircle,
  failed:               XCircle,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: PipelineStatus) {
  if (status === "completed") return "text-emerald-400";
  if (status === "paused")    return "text-amber-400";
  if (status === "failed" || status === "error") return "text-red-400";
  return "text-violet-400";
}

function statusDot(status: PipelineStatus) {
  if (status === "completed") return "bg-emerald-400";
  if (status === "paused")    return "bg-amber-400";
  if (status === "failed" || status === "error") return "bg-red-500";
  return "bg-violet-400";
}

function statusLabel(status: PipelineStatus) {
  if (status === "completed") return "Complete";
  if (status === "paused")    return "Paused";
  if (status === "failed")    return "Failed";
  if (status === "error")     return "Connection Error";
  if (status === "connecting") return "Connecting…";
  return "Running";
}

// ── Step item ─────────────────────────────────────────────────────────────────

interface StepItemProps {
  stepKey: PipelineStepKey;
  label: string;
  detail?: string;
  state: "done" | "active" | "pending";
  isLast: boolean;
}

function StepItem({ stepKey, label, detail, state, isLast }: StepItemProps) {
  const Icon = STEP_ICON[stepKey] ?? Activity;

  return (
    <div className="flex gap-3">
      {/* Icon column */}
      <div className="flex flex-col items-center">
        {/* Ring / icon */}
        <motion.div
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
            state === "done"
              ? "border-emerald-500/60 bg-emerald-500/15"
              : state === "active"
              ? "border-violet-500/70 bg-violet-500/15"
              : "border-white/10 bg-white/5"
          }`}
        >
          {state === "done" && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </motion.div>
          )}
          {state === "active" && (
            <>
              {/* Pulsing glow ring */}
              <motion.div
                className="absolute inset-0 rounded-full bg-violet-500/30"
                animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <Icon className="h-4 w-4 text-violet-300" />
            </>
          )}
          {state === "pending" && (
            <Icon className="h-3.5 w-3.5 text-white/20" />
          )}
        </motion.div>

        {/* Connector line */}
        {!isLast && (
          <div className="mt-1 w-px flex-1 min-h-[24px]">
            <motion.div
              className="w-full bg-gradient-to-b from-white/20 to-white/5"
              initial={{ height: 0 }}
              animate={{ height: state === "done" ? "100%" : state === "active" ? "50%" : "0%" }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{ height: "100%" }}
            />
          </div>
        )}
      </div>

      {/* Text column */}
      <div className={`pb-5 ${isLast ? "pb-0" : ""}`}>
        <p
          className={`text-sm font-medium leading-tight transition-colors duration-300 ${
            state === "done"
              ? "text-white/70"
              : state === "active"
              ? "text-white"
              : "text-white/25"
          }`}
        >
          {label}
        </p>
        {detail && state !== "pending" && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-0.5 text-xs text-white/40 leading-snug"
          >
            {detail}
          </motion.p>
        )}
        {state === "active" && (
          <motion.div
            className="mt-1 flex items-center gap-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Loader2 className="h-3 w-3 text-violet-400 animate-spin" />
            <span className="text-[11px] text-violet-400">Processing…</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Completion sparkles ───────────────────────────────────────────────────────

function CompletionBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-gradient-to-br from-violet-400 to-pink-400"
          style={{
            left: `${10 + i * 11}%`,
            top:  `${20 + (i % 3) * 15}%`,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale:   [0, 1.5, 0],
            opacity: [0, 1, 0],
            y:       [0, -24 - i * 4],
          }}
          transition={{
            duration: 0.9,
            delay:    i * 0.07,
            ease:     "easeOut",
          }}
        />
      ))}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CampaignPipelinePanelProps {
  campaignId: number | null;
  campaignName: string;
  open: boolean;
  onClose: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function CampaignPipelinePanel({
  campaignId,
  campaignName,
  open,
  onClose,
}: CampaignPipelinePanelProps) {
  const { steps, progress, status } = useCampaignPipeline(open ? campaignId : null);

  // Map received steps to a lookup for state derivation
  const receivedKeys = new Set(steps.map((s) => s.step));
  const lastStep     = steps[steps.length - 1];

  // Build the display list: use ALL_PIPELINE_STEPS as the ordered scaffold
  const displaySteps = ALL_PIPELINE_STEPS.map((meta) => {
    const received = steps.find((s) => s.step === meta.key);
    const isDone   = receivedKeys.has(meta.key);
    const isActive = !isDone && lastStep != null
      ? ALL_PIPELINE_STEPS.findIndex((m) => m.key === meta.key) ===
        ALL_PIPELINE_STEPS.findIndex((m) => m.key === lastStep.step) + 1
      : false;
    const isPending = !isDone && !isActive;

    return {
      ...meta,
      detail: received?.detail,
      state:  (isDone ? "done" : isActive ? "active" : "pending") as "done" | "active" | "pending",
    };
  });

  const isTerminal = status === "completed" || status === "paused" || status === "failed";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[420px] p-0 border-l border-white/10 bg-black/90 backdrop-blur-xl flex flex-col gap-0"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-white/8">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {/* Live status dot */}
                <motion.span
                  className={`inline-block h-2 w-2 rounded-full ${statusDot(status)}`}
                  animate={
                    !isTerminal
                      ? { opacity: [1, 0.3, 1] }
                      : { opacity: 1 }
                  }
                  transition={{ duration: 1.4, repeat: isTerminal ? 0 : Infinity }}
                />
                <span className={`text-xs font-medium ${statusColor(status)}`}>
                  {statusLabel(status)}
                </span>
              </div>
              <SheetTitle className="text-base font-semibold text-white leading-snug truncate">
                {campaignName || "Campaign Pipeline"}
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>

        {/* ── Progress bar ──────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white/40 font-medium">Pipeline progress</span>
            <motion.span
              key={progress}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-sm font-bold tabular-nums ${statusColor(status)}`}
            >
              {progress}%
            </motion.span>
          </div>

          {/* Gradient track */}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/8">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            {/* Shimmer sweep on active */}
            {!isTerminal && (
              <motion.div
                className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                animate={{ left: ["-10%", "110%"] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "linear", repeatDelay: 0.5 }}
              />
            )}
          </div>
        </div>

        {/* ── Step timeline ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-2">
          {/* Completion burst overlay */}
          <AnimatePresence>
            {status === "completed" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative mb-4"
              >
                <div className="relative rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 overflow-hidden">
                  <CompletionBurst />
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-sm font-semibold text-emerald-300">Pipeline Complete</p>
                  </div>
                  <p className="mt-0.5 text-xs text-emerald-400/60">
                    {lastStep?.detail ?? "All steps finished successfully."}
                  </p>
                </div>
              </motion.div>
            )}
            {status === "paused" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <PauseCircle className="h-4 w-4 text-amber-400 shrink-0" />
                  <p className="text-sm font-semibold text-amber-300">Campaign Paused</p>
                </div>
              </motion.div>
            )}
            {(status === "failed" || status === "error") && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <p className="text-sm font-semibold text-red-300">
                    {status === "error" ? "Connection lost" : "Pipeline Failed"}
                  </p>
                </div>
                {lastStep?.detail && (
                  <p className="mt-0.5 text-xs text-red-400/60 break-words">{lastStep.detail}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Steps */}
          <div className="space-y-0">
            {displaySteps.map((step, idx) => (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.3 }}
              >
                <StepItem
                  stepKey={step.key}
                  label={step.label}
                  detail={step.detail}
                  state={step.state}
                  isLast={idx === displaySteps.length - 1}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-white/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              onClick={onClose}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0"
              onClick={onClose}
            >
              View Campaign <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
