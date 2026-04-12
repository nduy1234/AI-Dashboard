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

// 2 successfully reactivated leads
const REACTIVATED = [
  {
    id: 1,
    name: "Oliver Grant",
    title: "Head of Revenue",
    company: "Beacon Analytics",
    email: "ogrant@beaconanalytics.io",
    dormantSince: "Dec 2025",
    reactivatedOn: "Apr 11, 2026",
    channel: "Email",
    campaign: "Q2 Reactivation Sequence",
    status: "meeting_booked",
    nextStep: "Discovery call Apr 22",
    avatar: "OG",
    journey: [
      { date: "Dec 2025",    event: "Last contact",           detail: "Replied to initial outreach but went dark", type: "dormant" },
      { date: "Apr 9, 2026", event: "Reactivation email sent", detail: "AI-personalised re-engagement sequence step 1", type: "email" },
      { date: "Apr 10",      event: "Email opened",           detail: "Opened 3× — high intent signal detected", type: "activity" },
      { date: "Apr 11",      event: "Reply received",         detail: "\"Interested, let's sync next week\"", type: "reply" },
      { date: "Apr 13",      event: "Meeting booked",         detail: "Discovery call scheduled Apr 22 via Cal.com", type: "meeting" },
    ],
  },
  {
    id: 2,
    name: "Amara Osei",
    title: "VP Operations",
    company: "Meridian Logistics",
    email: "aosei@meridianlogistics.com",
    dormantSince: "Jan 2026",
    reactivatedOn: "Apr 12, 2026",
    channel: "Email",
    campaign: "Logistics Vertical Reactivation",
    status: "replied",
    nextStep: "Send proposal by Apr 15",
    avatar: "AO",
    journey: [
      { date: "Jan 2026",    event: "Last contact",           detail: "Attended webinar, no follow-up action taken", type: "dormant" },
      { date: "Apr 10, 2026", event: "Reactivation email sent", detail: "Logistics-specific AI automation angle", type: "email" },
      { date: "Apr 12",      event: "Reply received",         detail: "\"We've been looking for something exactly like this\"", type: "reply" },
      { date: "Apr 13",      event: "Proposal requested",     detail: "Amara asked for a formal proposal", type: "activity" },
    ],
  },
];

// All attempted (15 dormant, 2 reactivated)
const ATTEMPTED_STATS = [
  { label: "Dormant Leads Targeted", value: "15",  note: "in reactivation pool" },
  { label: "Sequences Sent",          value: "14",  note: "1 bounced" },
  { label: "Opens Tracked",           value: "4",   note: "28.6% open rate" },
  { label: "Success Rate",            value: "13%", note: "2 of 15 reactivated" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  meeting_booked: { label: "Meeting Booked", color: "bg-emerald-500/10 text-emerald-400" },
  replied:        { label: "Replied",        color: "bg-violet-500/10 text-violet-400"   },
  contacted:      { label: "Contacted",      color: "bg-yellow-500/10 text-yellow-400"   },
};

const JOURNEY_ICON: Record<string, React.ElementType> = {
  dormant:  Clock,
  email:    Mail,
  activity: Zap,
  reply:    MessageSquare,
  meeting:  CalendarCheck,
};

const JOURNEY_COLOR: Record<string, string> = {
  dormant:  "bg-muted/60 text-muted-foreground",
  email:    "bg-blue-500/10 text-blue-400",
  activity: "bg-amber-500/10 text-amber-400",
  reply:    "bg-violet-500/10 text-violet-400",
  meeting:  "bg-emerald-500/10 text-emerald-400",
};

export default function ReactivationsDetail() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 1: true });

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
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[11px] font-semibold">2 Reactivated</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">Dormant contacts successfully re-engaged by the AI reactivation agent.</p>
          </div>
        </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ATTEMPTED_STATS.map((s) => (
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
        {REACTIVATED.map((lead) => {
          const sc = STATUS_CONFIG[lead.status];
          const isExpanded = !!expanded[lead.id];
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
                      {lead.avatar}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-bold text-foreground">{lead.name}</p>
                        <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                      </div>
                      <p className="text-[12px] text-muted-foreground">{lead.title} · {lead.company}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[11px] text-muted-foreground">Reactivated</p>
                      <p className="text-[12px] font-semibold text-foreground">{lead.reactivatedOn}</p>
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
                    <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Contact info */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contact Details</p>
                        {[
                          { icon: Mail,      label: lead.email },
                          { icon: Building2, label: lead.company },
                          { icon: RefreshCcw, label: `Dormant since ${lead.dormantSince}` },
                          { icon: Zap,        label: lead.campaign },
                        ].map((row, i) => (
                          <div key={i} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                            <row.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
                            <span>{row.label}</span>
                          </div>
                        ))}
                        <div className="mt-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
                          <p className="text-[11px] font-semibold text-emerald-400 mb-0.5">Next Step</p>
                          <p className="text-[12px] text-foreground/80">{lead.nextStep}</p>
                        </div>
                      </div>

                      {/* Journey timeline */}
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Re-engagement Journey</p>
                        <div className="space-y-2.5">
                          {lead.journey.map((step, i) => {
                            const JIcon = JOURNEY_ICON[step.type] ?? Clock;
                            const jColor = JOURNEY_COLOR[step.type];
                            const isLast = i === lead.journey.length - 1;
                            return (
                              <div key={i} className="flex items-start gap-2.5">
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${jColor}`}>
                                  <JIcon className="w-3 h-3" />
                                </div>
                                <div className="flex-1 min-w-0 pb-2.5 border-b border-border/40 last:border-0 last:pb-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-[12px] font-semibold text-foreground">{step.event}</p>
                                    <span className="text-[10px] text-muted-foreground/60">{step.date}</span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">{step.detail}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
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
            <p className="text-[13px] font-semibold text-foreground/70">13 leads still in the reactivation pool</p>
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
