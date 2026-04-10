import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useCampaignPipeline, ALL_PIPELINE_STEPS } from "@/hooks/use-campaign-pipeline";

interface CampaignProgressInlineProps {
  campaignId: number;
  onExpandClick?: () => void;
  onClose?: () => void;
}

export function CampaignProgressInline({ campaignId, onExpandClick, onClose }: CampaignProgressInlineProps) {
  const { steps, progress, status, currentStep } = useCampaignPipeline(campaignId);

  const receivedKeys = new Set(steps.map((s) => s.step));
  const isTerminal   = status === "completed" || status === "paused" || status === "failed";

  const latestLabel = steps[steps.length - 1]?.label ?? "Connecting…";

  const progressColor =
    status === "completed" ? "from-emerald-500 to-emerald-400"
    : status === "paused"  ? "from-amber-500 to-amber-400"
    : status === "failed"  ? "from-red-500 to-red-400"
    : "from-indigo-500 via-violet-500 to-pink-500";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="overflow-hidden"
    >
      <div className="mx-6 mb-3 mt-1 rounded-xl border border-white/8 bg-white/3 px-4 py-3 backdrop-blur-sm">
        {/* Top row: label + percentage + dismiss */}
        <div className="flex items-center justify-between mb-2">
          <div
            className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer"
            onClick={onExpandClick}
            title="Click to open pipeline details"
          >
            {/* Pulsing dot */}
            {!isTerminal && (
              <motion.span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
            {isTerminal && (
              <span
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                  status === "completed" ? "bg-emerald-400"
                  : status === "paused"  ? "bg-amber-400"
                  : "bg-red-400"
                }`}
              />
            )}
            <span className="text-xs text-white/60 truncate">{latestLabel}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <span
              className={`text-xs font-bold tabular-nums ${
                status === "completed" ? "text-emerald-400"
                : status === "paused"  ? "text-amber-400"
                : status === "failed"  ? "text-red-400"
                : "text-violet-400"
              }`}
            >
              {progress}%
            </span>
            {onClose && (
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="flex h-5 w-5 items-center justify-center rounded-full text-white/30 hover:bg-white/10 hover:text-white/70 transition-colors"
                title="Dismiss inline bar"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Gradient progress bar */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/8">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${progressColor}`}
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
          {/* Shimmer */}
          {!isTerminal && (
            <motion.div
              className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              animate={{ left: ["-15%", "115%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear", repeatDelay: 0.6 }}
            />
          )}
        </div>

        {/* Step dots */}
        <div className="mt-2.5 flex items-center gap-1">
          {ALL_PIPELINE_STEPS.map((meta) => {
            const isDone   = receivedKeys.has(meta.key);
            const isActive = !isDone && currentStep != null
              ? ALL_PIPELINE_STEPS.findIndex((m) => m.key === meta.key) ===
                ALL_PIPELINE_STEPS.findIndex((m) => m.key === currentStep) + 1
              : false;

            return (
              <motion.div
                key={meta.key}
                className={`h-1 flex-1 rounded-full transition-colors duration-400 ${
                  isDone
                    ? status === "completed" ? "bg-emerald-400"
                      : status === "failed"  ? "bg-red-400"
                      : "bg-violet-400"
                    : isActive
                    ? "bg-violet-400/50"
                    : "bg-white/10"
                }`}
                animate={isActive ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
                transition={isActive ? { duration: 1, repeat: Infinity } : {}}
              />
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
