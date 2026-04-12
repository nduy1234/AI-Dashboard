import { motion } from "framer-motion";
import { Users, Mail, Reply, CalendarCheck, RefreshCcw, MousePointerClick, ArrowUpRight, Zap, TrendingUp, Activity, Target } from "lucide-react";
import { StatCard } from "@/components/molecules/stat-card";
import { useDashboardStats, useDashboardCharts } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ModernAreaChart, MixedChart, ModernBarChart } from "@/components/molecules/charts";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" as const },
  }),
};

const agentActivities = [
  { agent: "Outbound Agent",    action: "Enriched 12 leads via Clay",          time: "2m ago",  status: "success", icon: Zap },
  { agent: "Email Agent",       action: "Sent 8 personalized sequences",        time: "5m ago",  status: "success", icon: Mail },
  { agent: "Reactivation Bot",  action: "Re-engaged 3 dormant contacts",        time: "14m ago", status: "success", icon: RefreshCcw },
  { agent: "Outbound Agent",    action: "Waiting on Apollo rate limit",          time: "22m ago", status: "warning", icon: Activity },
  { agent: "Conversion Agent",  action: "Booked 1 meeting via Cal.com",         time: "1h ago",  status: "success", icon: CalendarCheck },
];

/* Fallback sparkline-style data when API returns nothing */
const DEMO_MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DEMO_SENT   = [320, 450, 390, 580, 620, 740];
const DEMO_REPLIES = [28, 42, 36, 67, 78, 102];
const DEMO_LEADS   = [120, 180, 150, 230, 280, 310];
const DEMO_MEETINGS = [8, 14, 10, 18, 22, 26];
const DEMO_FUNNEL  = [
  { stage: "Prospects",   count: 1200 },
  { stage: "Emailed",     count: 740 },
  { stage: "Replied",     count: 102 },
  { stage: "Meetings",    count: 26 },
  { stage: "Conversions", count: 9 },
];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: charts, isLoading: chartsLoading } = useDashboardCharts();

  if (statsLoading || chartsLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 shimmer rounded-md" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-24 shimmer rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-80 shimmer rounded-lg" />
          <div className="h-80 shimmer rounded-lg" />
        </div>
      </div>
    );
  }

  const displayStats = stats || {
    totalProspects: 169, emailsSent: 54, replyRate: 0,
    meetingsBooked: 8, reactivatedLeads: 2, websiteConversions: 3
  };

  const outboundRaw   = (charts?.outboundPerformance ?? []) as { label: string; value: number; value2: number }[];
  const pipelineRaw   = (charts?.pipelineGenerated   ?? []) as { label: string; value: number; value2: number }[];
  const funnelRaw     = (charts?.conversionFunnel    ?? []) as { stage: string; count: number }[];

  const months      = outboundRaw.length ? outboundRaw.map(r => r.label) : DEMO_MONTHS;
  const sentData    = outboundRaw.length ? outboundRaw.map(r => r.value) : DEMO_SENT;
  const repliesData = outboundRaw.length ? outboundRaw.map(r => r.value2) : DEMO_REPLIES;

  const pipMonths   = pipelineRaw.length ? pipelineRaw.map(r => r.label) : DEMO_MONTHS;
  const leadsData   = pipelineRaw.length ? pipelineRaw.map(r => r.value) : DEMO_LEADS;
  const meetData    = pipelineRaw.length ? pipelineRaw.map(r => r.value2) : DEMO_MEETINGS;

  const funnel      = funnelRaw.length ? funnelRaw : [
    { stage: "Prospects",   count: 169 },
    { stage: "Emailed",     count: 54  },
    { stage: "Replied",     count: 0   },
    { stage: "Meetings",    count: 8   },
    { stage: "Conversions", count: 3   },
  ];

  const statCards = [
    { title: "Prospects",    value: displayStats.totalProspects.toLocaleString(),  icon: Users,             accent: "primary" as const, trend: stats?.trends?.totalProspects,    href: "/stats/prospects"     },
    { title: "Emails Sent",  value: displayStats.emailsSent.toLocaleString(),      icon: Mail,              accent: "accent"  as const, trend: stats?.trends?.emailsSent,        href: "/stats/emails"        },
    { title: "Reply Rate",   value: `${displayStats.replyRate}%`,                  icon: Reply,             accent: "cyan"    as const, trend: stats?.trends?.replyRate,         href: "/stats/reply-rate"    },
    { title: "Meetings",     value: displayStats.meetingsBooked,                   icon: CalendarCheck,     accent: "emerald" as const, trend: stats?.trends?.meetingsBooked,    href: "/stats/meetings"      },
    { title: "Reactivations",value: displayStats.reactivatedLeads,                 icon: RefreshCcw,        accent: "amber"   as const, trend: stats?.trends?.reactivatedLeads,  href: "/stats/reactivations" },
    { title: "Conversions",  value: displayStats.websiteConversions,               icon: MousePointerClick, accent: "primary" as const, trend: stats?.trends?.websiteConversions, href: "/stats/conversions"  },
  ];

  return (
    <motion.div initial="hidden" animate="show" className="space-y-5 md:space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} custom={0}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-lg sm:text-xl font-bold text-foreground">Revenue Command Center</h1>
              <Badge variant="outline" className="text-[10px] font-semibold border-primary/30 text-primary bg-primary/5 px-2 py-0.5 rounded-full">
                LIVE
              </Badge>
            </div>
            <p className="text-[13px] text-muted-foreground">Real-time pipeline overview across all autonomous AI agents.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/analytics">
              <Button variant="outline" size="sm" className="h-8 text-[13px] rounded-md border-border hover:bg-muted/60">
                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                Analytics
              </Button>
            </Link>
            <Link href="/campaigns">
              <Button size="sm" className="h-8 text-[13px] rounded-md bg-primary hover:bg-primary/90 text-primary-foreground border-0 shadow-sm">
                <Target className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden xs:inline">New </span>Campaign
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={fadeUp} custom={1}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-6 gap-2.5 md:gap-3">
          {statCards.map((card, i) => (
            <motion.div key={card.title} variants={fadeUp} custom={i + 2}>
              <StatCard
                title={card.title}
                value={card.value}
                icon={card.icon}
                accent={card.accent}
                href={card.href}
                trend={card.trend != null ? { value: Math.abs(card.trend), isPositive: card.trend >= 0 } : undefined}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Outbound Performance + Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
        <motion.div variants={fadeUp} custom={9} className="xl:col-span-2 h-full">
          <Card className="overflow-hidden h-full flex flex-col">
            <CardHeader className="pb-0 pt-4 px-5 flex flex-row items-center justify-between shrink-0">
              <div>
                <CardTitle className="text-[13px] font-semibold">Outbound Performance</CardTitle>
                <CardDescription className="text-xs mt-0.5">Emails sent vs replies — last 6 months</CardDescription>
              </div>
              <Link href="/analytics">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground px-2 rounded-md">
                  View all <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0 px-2 pb-2 flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-[220px]">
              <ModernAreaChart
                series={[
                  { name: "Sent",    data: sentData,    color: "#7c6ff7" },
                  { name: "Replies", data: repliesData, color: "#34d399" },
                ]}
                categories={months}
                height="100%"
                legend={true}
              />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Agent Activity */}
        <motion.div variants={fadeUp} custom={10} className="h-full">
          <Card className="overflow-hidden h-full">
            <CardHeader className="pb-0 pt-4 px-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-[13px] font-semibold">Agent Activity</CardTitle>
                <CardDescription className="text-xs mt-0.5">Live feed from running agents</CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]" />
                <span className="text-[10px] font-semibold text-emerald-500">Live</span>
              </div>
            </CardHeader>
            <CardContent className="pt-3 px-3 pb-4">
              <div className="space-y-1">
                {agentActivities.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2 rounded-md hover:bg-muted/50 transition-colors">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                      item.status === "success" ? "bg-emerald-500/10" : "bg-amber-500/10"
                    }`}>
                      <item.icon className={`w-3.5 h-3.5 ${item.status === "success" ? "text-emerald-500" : "text-amber-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-foreground/80 truncate">{item.agent}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight truncate">{item.action}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 pt-0.5">{item.time}</span>
                  </div>
                ))}
              </div>
              <Link href="/outbound">
                <Button variant="outline" size="sm" className="w-full mt-3 h-7 text-xs rounded-md border-border hover:bg-muted/60 text-muted-foreground">
                  View all agent logs
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Pipeline + Funnel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div variants={fadeUp} custom={11}>
          <Card className="overflow-hidden">
            <CardHeader className="pb-0 pt-4 px-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-[13px] font-semibold">Pipeline Generated</CardTitle>
                <CardDescription className="text-xs mt-0.5">New leads added vs meetings booked</CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground border-border">Monthly</Badge>
            </CardHeader>
            <CardContent className="pt-0 px-2 pb-2">
              <MixedChart
                barData={leadsData}
                lineData={meetData}
                categories={pipMonths}
                barLabel="Leads"
                lineLabel="Meetings"
                height={240}
              />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp} custom={12}>
          <Card className="overflow-hidden">
            <CardHeader className="pb-0 pt-4 px-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-[13px] font-semibold">Conversion Funnel</CardTitle>
                <CardDescription className="text-xs mt-0.5">Prospect → email → meeting → close</CardDescription>
              </div>
              <Link href="/conversion">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground px-2 rounded-md">
                  Details <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0 px-2 pb-2">
              <ModernBarChart
                series={[{ name: "Count", data: funnel.map(f => f.count) }]}
                categories={funnel.map(f => f.stage)}
                horizontal={true}
                height={240}
              />
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
