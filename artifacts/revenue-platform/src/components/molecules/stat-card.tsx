import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  accent?: "primary" | "accent" | "emerald" | "cyan" | "amber";
  href?: string;
}

const accentConfig = {
  primary: {
    border: "border-l-primary",
    iconBg: "bg-primary/10",
    icon: "text-primary",
    valueColor: "text-foreground",
    dotColor: "bg-primary/20",
  },
  accent: {
    border: "border-l-violet-500",
    iconBg: "bg-violet-500/10",
    icon: "text-violet-500",
    valueColor: "text-foreground",
    dotColor: "bg-violet-500/20",
  },
  emerald: {
    border: "border-l-emerald-500",
    iconBg: "bg-emerald-500/10",
    icon: "text-emerald-500",
    valueColor: "text-foreground",
    dotColor: "bg-emerald-500/20",
  },
  cyan: {
    border: "border-l-cyan-500",
    iconBg: "bg-cyan-500/10",
    icon: "text-cyan-500",
    valueColor: "text-foreground",
    dotColor: "bg-cyan-500/20",
  },
  amber: {
    border: "border-l-amber-500",
    iconBg: "bg-amber-500/10",
    icon: "text-amber-500",
    valueColor: "text-foreground",
    dotColor: "bg-amber-500/20",
  },
};

export function StatCard({ title, value, icon: Icon, trend, className, accent = "primary", href }: StatCardProps) {
  const cfg = accentConfig[accent];

  const inner = (
    <div className={cn(
      "group relative bg-card rounded-lg border border-border border-l-[3px] p-3.5 md:p-5",
      "hover:shadow-md transition-all duration-200",
      href ? "cursor-pointer hover:border-l-4" : "cursor-default",
      cfg.border,
      className
    )}>
      <div className="flex items-start justify-between gap-2 md:gap-3">
        <div className="flex-1 min-w-0 space-y-1.5 md:space-y-2">
          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 truncate">
            {title}
          </p>
          <div className="flex items-end gap-1.5 md:gap-2 flex-wrap">
            <h3 className={cn(
              "text-xl md:text-2xl font-bold tracking-tight leading-none",
              cfg.valueColor
            )}>
              {value}
            </h3>
            {trend && (
              <div className={cn(
                "flex items-center gap-0.5 text-[10px] md:text-[11px] font-semibold px-1 md:px-1.5 py-0.5 rounded-full",
                trend.isPositive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              )}>
                {trend.isPositive
                  ? <TrendingUp className="w-2 h-2 md:w-2.5 md:h-2.5" />
                  : <TrendingDown className="w-2 h-2 md:w-2.5 md:h-2.5" />}
                {Math.abs(trend.value)}%
              </div>
            )}
          </div>
          {href && (
            <p className={cn("text-[11px] font-medium flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity", cfg.icon)}>
              View details <ArrowRight className="w-3 h-3" />
            </p>
          )}
        </div>

        {/* Icon */}
        <div className={cn(
          "flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg shrink-0 transition-transform duration-200 group-hover:scale-105",
          cfg.iconBg
        )}>
          <Icon className={cn("w-4 h-4 md:w-5 md:h-5", cfg.icon)} />
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{inner}</Link>;
  }

  return inner;
}
