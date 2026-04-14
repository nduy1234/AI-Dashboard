import { AlertTriangle, Clock, CreditCard, X, Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useSubscription,
  useBillingPortal,
  useStartTrial,
} from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluralDays(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * TrialBanner
 *
 * Renders a contextual banner at the top of the dashboard:
 * - "trialing"  → countdown + "Upgrade Now" CTA
 * - "past_due"  → payment failure alert + "Update Payment" CTA
 * - "canceled"  → subscription ended + "Reactivate" CTA
 * - "none"      → invite to start a trial
 * - "active"    → renders nothing
 */
export function TrialBanner() {
  const { status, daysLeft, isLoading } = useSubscription();
  const portalMutation = useBillingPortal();
  const trialMutation = useStartTrial();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed || status === "active" || status === "paused") {
    return null;
  }

  if (status === "trialing") {
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
  }

  if (status === "past_due" || status === "unpaid") {
    return (
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
    );
  }

  if (status === "canceled" || status === "incomplete_expired") {
    return (
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
          onClick={() => trialMutation.mutate({})}
          disabled={trialMutation.isPending}
        >
          <Zap className="w-3 h-3 mr-1" />
          {trialMutation.isPending ? "Redirecting…" : "Reactivate"}
        </Button>
      </BannerShell>
    );
  }

  if (status === "none") {
    return (
      <BannerShell
        variant="info"
        icon={<Zap className="w-4 h-4 shrink-0" />}
        onDismiss={() => setDismissed(true)}
      >
        <span className="font-medium">Start your 14-day free trial.</span>
        <span className="text-[13px] opacity-80 hidden sm:inline">
          {" "}
          No charge until the trial ends. Cancel anytime.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto shrink-0 h-7 text-[12px] font-semibold border-current hover:bg-white/20"
          onClick={() => trialMutation.mutate({})}
          disabled={trialMutation.isPending}
        >
          {trialMutation.isPending ? "Redirecting…" : "Start Free Trial"}
        </Button>
      </BannerShell>
    );
  }

  return null;
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
