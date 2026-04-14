import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  RefreshCcw, ArrowLeft, Users, Mail, CheckCircle2, Clock,
  TrendingUp, ArrowRight, MessageSquare, Building2, Zap,
  CalendarCheck, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getReactivationsStats, getGetReactivationsStatsQueryKey } from "@workspace/api-client-react";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  meeting_booked: { label: "Meeting Booked", color: "bg-emerald-500/10 text-emerald-400" },
  replied:        { label: "Replied",        color: "bg-violet-500/10 text-violet-400"   },
  contacted:      { label: "Contacted",      color: "bg-yellow-500/10 text-yellow-400"   },
};

export default function ReactivationsDetail() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: getGetReactivationsStatsQueryKey(),
    queryFn: () => getReactivationsStats({ credentials: "include" }),
  });

  const reactivatedLeads: any[] = (data?.leads ?? []) as any[];
  const campaignStats: any   = data?.stats ?? {};
  const dormantTargeted = campaignStats.dormantTargeted ?? reactivatedLeads.length;
  const sequencesSent   = campaignStats.sequencesSent   ?? 0;
  const opensTracked    = campaignStats.opensTracked    ?? 0;
  const successRate     = dormantTargeted > 0
    ? `${Math.round((reactivatedLeads.length / dormantTargeted) * 100)}%`
    : "0%";

  const attemptedStats = [
    { label: "Dormant Leads Targeted", value: dormantTargeted.toString(), note: "in reactivation pool" },
    { label: "Sequences Sent",          value: sequencesSent.toString(),   note: "reactivation emails" },
    { label: "Opens Tracked",           value: opensTracked.toString(),    note: "email opens" },
    { label: "Success Rate",            value: successRate,                note: `${reactivatedLeads.length} reactivated` },
  ];

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
      <div className="absolute -top-24 -left-10 w-72 h-72 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />
      <div className="absolute top-60 -right-10 w-56 h-56 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />

      {/* Dark gradient hero header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card card-shadow-md">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md hover:bg-muted/60">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Reactivations</h1>
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[11px] font-semibold">{reactivatedLeads.length} Reactivated</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">Dormant contacts successfully re-engaged by the AI reactivation agent.</p>
          </div>
        </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {attemptedStats.map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="p-4">
              <p className="text-[12px] text-muted-foreground font-medium">{s.label}</p>
              <p className="text-2xl font-bold text-foreground mt-0.5">{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reactivated leads */}
      <div className="space-y-4">
        <h2 className="text-[14px] font-semibold text-foreground">Successfully Reactivated Contacts</h2>
        {reactivatedLeads.length === 0 && (
          <Card className="overflow-hidden">
            <CardContent className="p-6 text-center text-muted-foreground text-[13px]">
              No reactivated leads yet. The AI reactivation agent is monitoring dormant contacts.
            </CardContent>
          </Card>
        )}
        {reactivatedLeads.map((lead: any) => {
          const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email || "Unknown";
          const initials = fullName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
          const sc = STATUS_CONFIG[lead.status as string] ?? { label: lead.status ?? "Unknown", color: "bg-muted/60 text-muted-foreground" };
          const isExpanded = !!expanded[lead.id];
          const reactivatedOn = lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : "—";
          return (
            <Card key={lead.id} className="overflow-hidden border-l-4 border-l-amber-500">
              {/* Lead header */}
              <CardContent className="p-0">
                <div
                  className="flex items-start justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpanded(e => ({ ...e, [lead.id]: !e[lead.id] }))}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 text-[13px] font-bold shrink-0">
                      {initials}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-bold text-foreground">{fullName}</p>
                        <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                      </div>
                      <p className="text-[12px] text-muted-foreground">{lead.jobTitle ?? ""}{lead.company ? ` · ${lead.company}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[11px] text-muted-foreground">Reactivated</p>
                      <p className="text-[12px] font-semibold text-foreground">{reactivatedOn}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-border"
                  >
                    <div className="px-5 py-4 space-y-2">
                      {[
                        { icon: Mail,      label: lead.email ?? "—" },
                        { icon: Building2, label: lead.company ?? "—" },
                        { icon: Zap,       label: lead.campaignName ?? "Reactivation Campaign" },
                      ].map((row, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <row.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
                          <span>{row.label}</span>
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

      {/* Pipeline hint */}
      <Card className="overflow-hidden bg-muted/20 border-dashed">
        <CardContent className="p-5 flex items-start gap-3">
          <TrendingUp className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-foreground/70">{Math.max(0, dormantTargeted - reactivatedLeads.length)} leads still in the reactivation pool</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              The AI agent is monitoring for high-intent signals (email opens, site visits) across the remaining 13 dormant leads.
              Follow-up sequences are scheduled over the next 7 days.
            </p>
            <Link href="/reactivation">
              <Button variant="outline" size="sm" className="mt-3 h-7 text-[12px] gap-1.5">
                Manage Reactivation <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
