import { AlertTriangle, Clock, CreditCard, X, Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useUserMe, useBillingPortal } from "@/hooks/use-subscription";
import { UpgradeModal } from "./upgrade-modal";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluralDays(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

// ---------------------------------------------------------------------------
// TrialBanner
// ---------------------------------------------------------------------------

/**
 * Contextual billing banner at the top of the dashboard.
 *
 * - "none"      → "Upgrade to Pro" → opens plan-selection modal
 * - "trialing"  → countdown + "Manage Plan" (Stripe portal)
 * - "past_due"  → payment failure + "Update Payment" (Stripe portal)
 * - "canceled"  → "Reactivate" → opens plan-selection modal
 * - "active"    → renders nothing
 */
export function TrialBanner() {
  const { isPro, status, daysLeft, isLoading } = useUserMe();
  const portalMutation = useBillingPortal();
  const [dismissed, setDismissed] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Hide entirely when user is confirmed pro (active subscription or trial)
  if (isLoading || dismissed || isPro || status === "paused") {
    return null;
  }

  return (
    <>
      {/* Plan-selection modal — shared by all CTA paths that need it */}
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />

      {status === "trialing" && (() => {
        const isUrgent = daysLeft !== null && daysLeft <= 3;
        return (
          <BannerShell
            variant={isUrgent ? "warning" : "info"}
            icon={<Clock className="w-4 h-4 shrink-0" />}
            onDismiss={() => setDismissed(true)}
          >
            <span className="font-medium">
              {daysLeft === 0
                ? "Your free trial ends today."
                : daysLeft !== null
                  ? `${pluralDays(daysLeft)} left in your free trial.`
                  : "Your free trial is active."}
            </span>
            <span className="text-[13px] opacity-80 hidden sm:inline">
              {" "}
              Your card won't be charged until the trial ends.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto shrink-0 h-7 text-[12px] font-semibold border-current hover:bg-white/20"
              onClick={() => portalMutation.mutate({})}
              disabled={portalMutation.isPending}
            >
              <Zap className="w-3 h-3 mr-1" />
              {portalMutation.isPending ? "Opening…" : "Manage Plan"}
            </Button>
          </BannerShell>
        );
      })()}

      {(status === "past_due" || status === "unpaid") && (
        <BannerShell
          variant="error"
          icon={<AlertTriangle className="w-4 h-4 shrink-0" />}
          onDismiss={() => setDismissed(true)}
        >
          <span className="font-medium">Payment failed.</span>
          <span className="text-[13px] opacity-80 hidden sm:inline">
            {" "}
            Some features may be restricted until your payment is resolved.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto shrink-0 h-7 text-[12px] font-semibold border-current hover:bg-white/20"
            onClick={() => portalMutation.mutate({})}
            disabled={portalMutation.isPending}
          >
            <CreditCard className="w-3 h-3 mr-1" />
            {portalMutation.isPending ? "Opening…" : "Update Payment"}
          </Button>
        </BannerShell>
      )}

      {(status === "canceled" || status === "incomplete_expired") && (
        <BannerShell
          variant="warning"
          icon={<AlertTriangle className="w-4 h-4 shrink-0" />}
          onDismiss={() => setDismissed(true)}
        >
          <span className="font-medium">Your subscription has ended.</span>
          <span className="text-[13px] opacity-80 hidden sm:inline">
            {" "}
            Reactivate to regain full access.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto shrink-0 h-7 text-[12px] font-semibold border-current hover:bg-white/20"
            onClick={() => setUpgradeOpen(true)}
          >
            <Zap className="w-3 h-3 mr-1" />
            Reactivate
          </Button>
        </BannerShell>
      )}

      {status === "none" && (
        <BannerShell
          variant="info"
          icon={<Zap className="w-4 h-4 shrink-0" />}
          onDismiss={() => setDismissed(true)}
        >
          <span className="font-medium">Unlock the full AI revenue platform.</span>
          <span className="text-[13px] opacity-80 hidden sm:inline">
            {" "}
            14-day free trial — no charge until the trial ends.
          </span>
          <Button
            size="sm"
            className="ml-auto shrink-0 h-7 text-[12px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground border-0 shadow-sm"
            onClick={() => setUpgradeOpen(true)}
          >
            <Zap className="w-3 h-3 mr-1" />
            Upgrade to Pro
          </Button>
        </BannerShell>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// BannerShell
// ---------------------------------------------------------------------------

type BannerVariant = "info" | "warning" | "error";

interface BannerShellProps {
  variant: BannerVariant;
  icon: React.ReactNode;
  children: React.ReactNode;
  onDismiss?: () => void;
}

const variantStyles: Record<BannerVariant, string> = {
  info: "bg-primary/10 text-primary border-primary/20",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  error: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

function BannerShell({ variant, icon, children, onDismiss }: BannerShellProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-[13px] font-medium",
        variantStyles[variant],
      )}
    >
      {icon}
      {children}
      {onDismiss && (
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          className="ml-1 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
