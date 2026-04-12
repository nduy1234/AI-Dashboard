import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  MousePointerClick, ArrowLeft, DollarSign, TrendingUp, CheckCircle2,
  Clock, Building2, Mail, Calendar, ChevronDown, ChevronUp,
  ArrowRight, Target, Zap, CalendarCheck, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 3 conversions
const CONVERSIONS = [
  {
    id: 1,
    name: "Sarah Johnson",
    title: "VP of Sales",
    company: "TechCorp Inc",
    email: "sarah@techcorp.io",
    industry: "SaaS",
    dealValue: 18000,
    plan: "Growth",
    convertedOn: "Apr 11, 2026",
    closedBy: "AI Outbound Agent",
    campaign: "Tech Outbound Q2",
    avatar: "SJ",
    accentColor: "border-l-primary",
    touchpoints: 4,
    daysToClose: 12,
    journey: [
      { date: "Mar 30",  event: "Prospect enriched",    detail: "Clay found contact at TechCorp — VP Sales role",    type: "enrich" },
      { date: "Apr 1",   event: "Email sent",           detail: "Personalized intro — AI outbound sequence step 1",  type: "email"  },
      { date: "Apr 2",   event: "Discovery call",       detail: "30-min call booked via Cal.com, strong buying signal", type: "meeting" },
      { date: "Apr 7",   event: "Follow-up sent",       detail: "AI generated proposal email based on call notes",   type: "email"  },
      { date: "Apr 9",   event: "Contract reviewed",    detail: "Legal sign-off requested, pricing agreed",          type: "activity" },
      { date: "Apr 11",  event: "Deal closed",          detail: "Growth plan — $18k ARR · 12 months",                type: "close"  },
    ],
  },
  {
    id: 2,
    name: "David Kim",
    title: "CTO",
    company: "PropTech Hub",
    email: "dkim@proptechhub.com",
    industry: "Real Estate",
    dealValue: 12000,
    plan: "Starter",
    convertedOn: "Apr 12, 2026",
    closedBy: "AI Outbound Agent",
    campaign: "Real Estate Tech",
    avatar: "DK",
    accentColor: "border-l-cyan-500",
    touchpoints: 3,
    daysToClose: 9,
    journey: [
      { date: "Apr 3",   event: "Prospect identified",  detail: "RB2B signal — PropTech Hub visited pricing page",  type: "enrich"  },
      { date: "Apr 4",   event: "Product demo",         detail: "45-min demo booked — showed API integration layer", type: "meeting" },
      { date: "Apr 9",   event: "Pricing call",         detail: "David confirmed budget; legal fast-tracked contract",type: "activity" },
      { date: "Apr 12",  event: "Deal closed",          detail: "Starter plan — $12k ARR · 12 months",             type: "close"   },
    ],
  },
  {
    id: 3,
    name: "Natasha Brown",
    title: "VP Engineering",
    company: "HealthStack",
    email: "nbrown@healthstack.io",
    industry: "HealthTech",
    dealValue: 24000,
    plan: "Enterprise",
    convertedOn: "Apr 13, 2026",
    closedBy: "AI Outbound Agent",
    campaign: "HealthTech Outreach",
    avatar: "NB",
    accentColor: "border-l-emerald-500",
    touchpoints: 5,
    daysToClose: 14,
    journey: [
      { date: "Mar 30",  event: "Apollo import",        detail: "Lead imported from Apollo (HealthTech filter)",    type: "enrich"  },
      { date: "Apr 1",   event: "Email sequence start", detail: "5-step AI sequence initiated",                    type: "email"   },
      { date: "Apr 2",   event: "Email opened",         detail: "Opened 5× in 24h — high intent flag raised",      type: "activity" },
      { date: "Apr 4",   event: "Reply received",       detail: "\"We need exactly this\" — booked discovery call", type: "reply"  },
      { date: "Apr 11",  event: "Technical review",     detail: "Security review passed; compliance docs provided", type: "meeting" },
      { date: "Apr 13",  event: "Deal closed",          detail: "Enterprise plan — $24k ARR · Annual contract",    type: "close"   },
    ],
  },
];

const TOTAL_ARR = CONVERSIONS.reduce((s, c) => s + c.dealValue, 0);
const AVG_DAYS  = Math.round(CONVERSIONS.reduce((s, c) => s + c.daysToClose, 0) / CONVERSIONS.length);

const JOURNEY_ICON: Record<string, React.ElementType> = {
  enrich:   Zap,
  email:    Mail,
  meeting:  CalendarCheck,
  activity: Clock,
  reply:    MousePointerClick,
  close:    CheckCircle2,
};

const JOURNEY_COLOR: Record<string, string> = {
  enrich:   "bg-amber-500/10 text-amber-400",
  email:    "bg-blue-500/10 text-blue-400",
  meeting:  "bg-violet-500/10 text-violet-400",
  activity: "bg-muted/60 text-muted-foreground",
  reply:    "bg-cyan-500/10 text-cyan-400",
  close:    "bg-emerald-500/10 text-emerald-400",
};

export default function ConversionsDetail() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 1: true });

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
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] font-semibold">3 Closed</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">Deals closed by AI-driven outbound and reactivation campaigns.</p>
          </div>
        </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Conversions", value: "3",                              icon: CheckCircle2,    color: "text-primary",    bg: "bg-primary/10"    },
          { label: "Total ARR",          value: `$${(TOTAL_ARR/1000).toFixed(0)}k`, icon: DollarSign,   color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Avg Deal Value",     value: `$${Math.round(TOTAL_ARR/3/1000)}k`, icon: Target,      color: "text-amber-400",  bg: "bg-amber-500/10"  },
          { label: "Avg Days to Close",  value: `${AVG_DAYS}d`,                 icon: Clock,           color: "text-cyan-400",   bg: "bg-cyan-500/10"   },
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
      <div className="grid grid-cols-3 gap-3">
        {CONVERSIONS.map((c) => (
          <Card key={c.id} className={`overflow-hidden border-l-4 ${c.accentColor}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center text-foreground/70 text-[11px] font-bold">
                  {c.avatar}
                </div>
                <div>
                  <p className="text-[12px] font-bold text-foreground">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.company}</p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">Plan</span>
                  <Badge variant="outline" className="text-[10px]">{c.plan}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">ARR</span>
                  <span className="text-[12px] font-bold text-foreground">${(c.dealValue/1000).toFixed(0)}k</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-muted-foreground">Closed</span>
                  <span className="text-[11px] text-foreground/80">{c.convertedOn.replace(", 2026","")}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed journey per conversion */}
      <div className="space-y-4">
        <h2 className="text-[14px] font-semibold text-foreground">Conversion Journeys</h2>
        {CONVERSIONS.map((deal) => {
          const isExpanded = !!expanded[deal.id];
          return (
            <Card key={deal.id} className={`overflow-hidden border-l-4 ${deal.accentColor}`}>
              <CardContent className="p-0">
                {/* Header row */}
                <div
                  className="flex items-start justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpanded(e => ({ ...e, [deal.id]: !e[deal.id] }))}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[13px] font-bold shrink-0">
                      {deal.avatar}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-bold text-foreground">{deal.name}</p>
                        <Badge className="text-[10px] bg-emerald-500/10 text-emerald-400">{deal.plan} Plan</Badge>
                      </div>
                      <p className="text-[12px] text-muted-foreground">{deal.title} · {deal.company} · ${(deal.dealValue/1000).toFixed(0)}k ARR</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[11px] text-muted-foreground">Closed</p>
                      <p className="text-[12px] font-semibold text-foreground">{deal.convertedOn.replace(", 2026","")}</p>
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
                    <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Contact details */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Deal Details</p>
                        {[
                          { icon: Mail,         label: deal.email },
                          { icon: Building2,    label: `${deal.company} · ${deal.industry}` },
                          { icon: DollarSign,   label: `$${deal.dealValue.toLocaleString()} ARR (${deal.plan})` },
                          { icon: Clock,        label: `${deal.daysToClose} days to close` },
                          { icon: Users,        label: `${deal.touchpoints} touchpoints` },
                          { icon: Zap,          label: `Closed by: ${deal.closedBy}` },
                          { icon: Calendar,     label: deal.campaign },
                        ].map((row, i) => (
                          <div key={i} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                            <row.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
                            <span className="truncate">{row.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Journey timeline */}
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Deal Journey</p>
                        <div className="space-y-2.5">
                          {deal.journey.map((step, i) => {
                            const JIcon = JOURNEY_ICON[step.type] ?? Clock;
                            const jColor = JOURNEY_COLOR[step.type];
                            return (
                              <div key={i} className="flex items-start gap-2.5">
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${jColor}`}>
                                  <JIcon className="w-3 h-3" />
                                </div>
                                <div className="flex-1 min-w-0 pb-2.5 border-b border-border/40 last:border-0 last:pb-0">
                                  <div className="flex items-center gap-2 flex-wrap">
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

      {/* Pipeline link */}
      <Card className="overflow-hidden bg-muted/20 border-dashed">
        <CardContent className="p-5 flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground/70">8 meeting-stage leads still in pipeline</p>
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
