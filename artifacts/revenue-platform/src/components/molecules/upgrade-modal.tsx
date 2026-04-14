import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStartTrial, useUserMe } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";
import {
  Check,
  Zap,
  Building2,
  Sparkles,
  ArrowRight,
  Shield,
  Clock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Plan data
// ---------------------------------------------------------------------------

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: "starter" | "pro" | "enterprise";
  name: string;
  price: string;
  period: string;
  description: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline";
  icon: React.ElementType;
  features: PlanFeature[];
  cta: string;
  highlight: boolean;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$0",
    period: "forever",
    description: "Get a feel for the platform with limited access.",
    icon: Sparkles,
    features: [
      { text: "Up to 100 prospects", included: true },
      { text: "1 active campaign", included: true },
      { text: "Basic analytics", included: true },
      { text: "Email support", included: true },
      { text: "AI outbound agent", included: false },
      { text: "Reactivation workflows", included: false },
      { text: "HubSpot / CRM sync", included: false },
      { text: "Priority support", included: false },
    ],
    cta: "Continue Free",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$149",
    period: "/ month",
    description: "Full AI pipeline for growing revenue teams.",
    badge: "Most Popular",
    badgeVariant: "default",
    icon: Zap,
    features: [
      { text: "Unlimited prospects", included: true },
      { text: "Unlimited campaigns", included: true },
      { text: "Advanced analytics & reports", included: true },
      { text: "AI outbound agent", included: true },
      { text: "Reactivation workflows", included: true },
      { text: "HubSpot / CRM sync", included: true },
      { text: "Priority support", included: true },
      { text: "White-label exports", included: false },
    ],
    cta: "Start 14-Day Free Trial",
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Dedicated infrastructure, SLAs, and custom integrations.",
    badge: "Contact Us",
    badgeVariant: "secondary",
    icon: Building2,
    features: [
      { text: "Everything in Pro", included: true },
      { text: "Dedicated infrastructure", included: true },
      { text: "Custom AI model fine-tuning", included: true },
      { text: "White-label exports", included: true },
      { text: "SSO & SAML", included: true },
      { text: "Custom SLA & uptime guarantee", included: true },
      { text: "Onboarding & migration support", included: true },
      { text: "Dedicated account manager", included: true },
    ],
    cta: "Talk to Sales",
    highlight: false,
  },
];

// ---------------------------------------------------------------------------
// UpgradeModal
// ---------------------------------------------------------------------------

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan["id"]>("pro");
  const trialMutation = useStartTrial();
  const { isPro } = useUserMe();

  // Close automatically if user becomes pro (e.g. after webhook lands)
  useEffect(() => {
    if (isPro && open) onOpenChange(false);
  }, [isPro, open, onOpenChange]);

  function handleCta(plan: Plan) {
    if (plan.id === "starter") {
      onOpenChange(false);
      return;
    }
    if (plan.id === "enterprise") {
      window.open("mailto:sales@yourdomain.com?subject=Enterprise%20Inquiry", "_blank");
      return;
    }
    // Pro — start Stripe checkout with 14-day trial
    trialMutation.mutate({});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-4xl w-full p-0 gap-0 overflow-hidden border border-border/60",
          "bg-background shadow-2xl rounded-2xl",
        )}
      >
        {/* Header */}
        <div className="px-6 pt-7 pb-5 text-center border-b border-border/40">
          <DialogHeader className="items-center space-y-2">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold mb-1">
              <Sparkles className="w-3 h-3" />
              Upgrade to Pro
            </div>
            <DialogTitle className="text-[22px] font-bold tracking-tight">
              Choose the right plan for your team
            </DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground max-w-md">
              All paid plans include a{" "}
              <span className="font-semibold text-foreground">14-day free trial</span> with your
              card collected upfront — you won't be charged until the trial ends.
            </DialogDescription>
          </DialogHeader>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
            {[
              { icon: Shield, label: "Cancel anytime" },
              { icon: Clock, label: "14-day free trial" },
              { icon: Check, label: "No setup fees" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icon className="w-3.5 h-3.5 text-emerald-500" />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-x divide-border/40">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isSelected = selectedPlan === plan.id;
            const isPro = plan.id === "pro";

            return (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={cn(
                  "relative text-left p-5 transition-all duration-150 focus:outline-none",
                  "hover:bg-muted/40",
                  isPro && "bg-primary/[0.03]",
                  isSelected && "ring-2 ring-inset ring-primary",
                )}
              >
                {/* Popular badge */}
                {plan.badge && (
                  <div className="absolute top-4 right-4">
                    <Badge
                      variant={plan.badgeVariant ?? "default"}
                      className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        isPro && "bg-primary text-primary-foreground border-0",
                      )}
                    >
                      {plan.badge}
                    </Badge>
                  </div>
                )}

                {/* Icon + name */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      isPro ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-sm text-foreground">{plan.name}</span>
                </div>

                {/* Price */}
                <div className="mb-1 flex items-end gap-1">
                  <span
                    className={cn(
                      "text-2xl font-bold leading-none",
                      isPro ? "text-foreground" : "text-foreground/80",
                    )}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-[12px] text-muted-foreground pb-0.5">{plan.period}</span>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground mb-4 leading-snug">
                  {plan.description}
                </p>

                {/* Features */}
                <ul className="space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2">
                      <div
                        className={cn(
                          "w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                          f.included
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-muted text-muted-foreground/40",
                        )}
                      >
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      </div>
                      <span
                        className={cn(
                          "text-[11px] leading-tight",
                          f.included ? "text-foreground/80" : "text-muted-foreground/50 line-through",
                        )}
                      >
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Footer CTA */}
        <div className="px-6 py-4 border-t border-border/40 flex items-center justify-between gap-4 bg-muted/20">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Prices in USD. Taxes may apply.&nbsp;
            <span className="text-foreground/60">You can upgrade, downgrade, or cancel at any time.</span>
          </p>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[12px] text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              Maybe later
            </Button>
            <Button
              size="sm"
              className={cn(
                "h-8 text-[12px] font-semibold rounded-lg gap-1.5",
                selectedPlan === "pro"
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                  : "bg-foreground hover:bg-foreground/90 text-background",
              )}
              onClick={() => {
                const plan = PLANS.find((p) => p.id === selectedPlan)!;
                handleCta(plan);
              }}
              disabled={trialMutation.isPending}
            >
              {trialMutation.isPending ? (
                "Redirecting to Stripe…"
              ) : (
                <>
                  {PLANS.find((p) => p.id === selectedPlan)?.cta}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
