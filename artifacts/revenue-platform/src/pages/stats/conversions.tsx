import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowLeft, DollarSign, TrendingUp, CheckCircle2,
  Clock, Building2, Mail, Calendar, ChevronDown, ChevronUp,
  ArrowRight, Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getConversionsStats, getGetConversionsStatsQueryKey } from "@workspace/api-client-react";

// Accent color cycle for conversion cards
const ACCENT_COLORS = ["border-l-primary", "border-l-cyan-500", "border-l-emerald-500", "border-l-violet-500", "border-l-amber-500"];

export default function ConversionsDetail() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: getGetConversionsStatsQueryKey(),
    queryFn: () => getConversionsStats({ credentials: "include" }),
  });

  const conversions: any[] = (data?.conversions ?? []) as any[];
  const statsData: any = data?.stats ?? {};

  const TOTAL_ARR = statsData.totalARR ?? conversions.reduce((s: number, c: any) => s + (c.dealValue ?? 0), 0);
  const AVG_DAYS  = statsData.avgDaysToClose ?? (conversions.length > 0
    ? Math.round(conversions.reduce((s: number, c: any) => s + (c.daysToClose ?? 0), 0) / conversions.length)
    : 0);
  const AVG_DEAL  = conversions.length > 0 ? Math.round(TOTAL_ARR / conversions.length) : 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 shimmer rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 shimmer rounded-lg" />)}
        </div>
        <div className="h-60 shimmer rounded-lg" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6 relative">
      <div className="absolute -top-24 -left-10 w-72 h-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute top-60 -right-10 w-56 h-56 rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      {/* Dark gradient hero header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card card-shadow-md">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md hover:bg-muted/60">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Conversions</h1>
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] font-semibold">{conversions.length} Closed</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">Deals closed by AI-driven outbound and reactivation campaigns.</p>
          </div>
        </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Conversions", value: conversions.length.toString(),                   icon: CheckCircle2, color: "text-primary",    bg: "bg-primary/10"    },
          { label: "Total ARR",          value: `$${Math.round(TOTAL_ARR/1000)}k`,              icon: DollarSign,   color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Avg Deal Value",     value: `$${Math.round(AVG_DEAL/1000)}k`,               icon: Target,       color: "text-amber-400",  bg: "bg-amber-500/10"  },
          { label: "Avg Days to Close",  value: AVG_DAYS > 0 ? `${AVG_DAYS}d` : "—",           icon: Clock,        color: "text-cyan-400",   bg: "bg-cyan-500/10"   },
        ].map((k) => (
          <Card key={k.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] text-muted-foreground font-medium">{k.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{k.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.bg}`}>
                  <k.icon className={`w-4.5 h-4.5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan breakdown */}
      {conversions.length > 0 && (
      <div className="grid grid-cols-3 gap-3">
        {conversions.slice(0, 3).map((c: any, idx: number) => {
          const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown";
          const initials = fullName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
          const accentColor = ACCENT_COLORS[idx % ACCENT_COLORS.length];
          const dealVal = c.dealValue ?? 0;
          const closedOn = c.convertedOn ?? (c.updatedAt ? new Date(c.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
          return (
            <Card key={c.id} className={`overflow-hidden border-l-4 ${accentColor}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center text-foreground/70 text-[11px] font-bold">
                    {initials}
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-foreground">{fullName}</p>
                    <p className="text-[11px] text-muted-foreground">{c.company ?? "—"}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-muted-foreground">Plan</span>
                    <Badge variant="outline" className="text-[10px]">{c.plan ?? "—"}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-muted-foreground">ARR</span>
                    <span className="text-[12px] font-bold text-foreground">${Math.round(dealVal/1000)}k</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-muted-foreground">Closed</span>
                    <span className="text-[11px] text-foreground/80">{closedOn}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}

      {/* Detailed journey per conversion */}
      <div className="space-y-4">
        <h2 className="text-[14px] font-semibold text-foreground">Conversion Journeys</h2>
        {conversions.length === 0 && (
          <Card className="overflow-hidden">
            <CardContent className="p-6 text-center text-muted-foreground text-[13px]">
              No conversions yet. AI agents are actively working the pipeline.
            </CardContent>
          </Card>
        )}
        {conversions.map((deal: any, idx: number) => {
          const isExpanded = !!expanded[deal.id];
          const fullName = [deal.firstName, deal.lastName].filter(Boolean).join(" ") || deal.email || "Unknown";
          const initials = fullName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
          const accentColor = ACCENT_COLORS[idx % ACCENT_COLORS.length];
          const dealVal = deal.dealValue ?? 0;
          const closedOn = deal.convertedOn ?? (deal.updatedAt ? new Date(deal.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
          return (
            <Card key={deal.id} className={`overflow-hidden border-l-4 ${accentColor}`}>
              <CardContent className="p-0">
                {/* Header row */}
                <div
                  className="flex items-start justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpanded(e => ({ ...e, [deal.id]: !e[deal.id] }))}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[13px] font-bold shrink-0">
                      {initials}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-bold text-foreground">{fullName}</p>
                        <Badge className="text-[10px] bg-emerald-500/10 text-emerald-400">{deal.plan ?? "Deal"}</Badge>
                      </div>
                      <p className="text-[12px] text-muted-foreground">{deal.jobTitle ?? ""}{deal.company ? ` · ${deal.company}` : ""}{dealVal > 0 ? ` · $${Math.round(dealVal/1000)}k ARR` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[11px] text-muted-foreground">Closed</p>
                      <p className="text-[12px] font-semibold text-foreground">{closedOn}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-border"
                  >
                    <div className="px-5 py-4 space-y-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Deal Details</p>
                      {[
                        { icon: Mail,      label: deal.email ?? "—" },
                        { icon: Building2, label: `${deal.company ?? "—"}${deal.industry ? ` · ${deal.industry}` : ""}` },
                        { icon: DollarSign, label: dealVal > 0 ? `$${dealVal.toLocaleString()} ARR${deal.plan ? ` (${deal.plan})` : ""}` : "—" },
                        { icon: Clock,     label: deal.daysToClose > 0 ? `${deal.daysToClose} days to close` : "—" },
                        { icon: Calendar,  label: deal.campaignName ?? "—" },
                      ].map((row, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <row.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
                          <span className="truncate">{row.label}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pipeline link */}
      <Card className="overflow-hidden bg-muted/20 border-dashed">
        <CardContent className="p-5 flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground/70">{data?.pipelineCount ?? 0} meeting-stage leads still in pipeline</p>
            <p className="text-[12px] text-muted-foreground">
              Continue nurturing to close more deals. AI agents are tracking engagement signals.
            </p>
          </div>
          <Link href="/conversion">
            <Button variant="outline" size="sm" className="h-7 text-[12px] gap-1.5 shrink-0">
              View Pipeline <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </motion.div>
  );
}
