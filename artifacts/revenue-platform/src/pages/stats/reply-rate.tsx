import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Reply, ArrowLeft, TrendingUp, AlertCircle, Inbox, MessageSquare,
  ThumbsUp, ThumbsDown, Clock, Zap, Send, BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModernAreaChart, ModernBarChart } from "@/components/molecules/charts";
import { useQuery } from "@tanstack/react-query";
import { getReplyRateStats, getGetReplyRateStatsQueryKey } from "@workspace/api-client-react";

const TIPS = [
  {
    icon: MessageSquare,
    color: "text-primary",
    bg: "bg-primary/10",
    title: "Personalise subject lines",
    desc: "AI-generated subjects based on company news lift reply rates by 35% on average.",
  },
  {
    icon: Clock,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    title: "Send at peak times",
    desc: "Tuesday–Thursday 9–11 AM local time typically yields the highest open and reply rates.",
  },
  {
    icon: Zap,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    title: "Follow-up sequence",
    desc: "Send a 2-touch follow-up 3 days after the first email. Most replies come from follow-ups.",
  },
  {
    icon: BarChart3,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    title: "A/B test your copy",
    desc: "Test value proposition vs pain-point framing. Run at least 50 sends per variant.",
  },
];

export default function ReplyRateDetail() {
  const { data, isLoading } = useQuery({
    queryKey: getGetReplyRateStatsQueryKey(),
    queryFn: () => getReplyRateStats({ credentials: "include" }),
  });

  const historyLabels: string[] = (data?.historyLabels ?? []) as string[];
  const historyRate: number[]   = (data?.historyRate   ?? []) as number[];
  const campaignBreakdown: any[] = (data?.campaignBreakdown ?? []) as any[];
  const totalReplies    = (data as any)?.totalReplies    ?? 0;
  const positiveReplies = (data as any)?.positiveReplies ?? 0;
  const negativeReplies = (data as any)?.negativeReplies ?? 0;
  const totalSent       = (data as any)?.totalSent       ?? 0;
  const overallRate     = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : "0";
  const awaiting        = Math.max(0, totalSent - totalReplies);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 shimmer rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 shimmer rounded-lg" />)}
        </div>
        <div className="h-48 shimmer rounded-lg" />
        <div className="h-48 shimmer rounded-lg" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6 relative">
      <div className="absolute -top-24 -left-10 w-72 h-72 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />
      <div className="absolute top-60 -right-10 w-56 h-56 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />

      {/* Hero header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card card-shadow-md">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md hover:bg-muted/60">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Reply Rate</h1>
              <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[11px] font-semibold">{overallRate}%</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">Email reply analytics and response tracking across all campaigns.</p>
          </div>
        </div>
        </div>
      </div>

      {/* Summary alert — shown only when 0 replies and emails were sent */}
      {totalReplies === 0 && totalSent > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-amber-400">No replies received yet</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {totalSent} emails were sent. Replies typically arrive within 24–72 hours of sending.
              The inbox is being monitored — this page will update automatically once replies come in.
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Replies",     value: totalReplies.toString(),    icon: Reply,       color: "text-cyan-400",    bg: "bg-cyan-500/10",    sub: `of ${totalSent} sent` },
          { label: "Positive Replies",  value: positiveReplies.toString(), icon: ThumbsUp,    color: "text-emerald-400", bg: "bg-emerald-500/10", sub: "interested" },
          { label: "Negative Replies",  value: negativeReplies.toString(), icon: ThumbsDown,  color: "text-red-400",     bg: "bg-red-500/10",     sub: "unsubscribed" },
          { label: "Awaiting Reply",    value: awaiting.toString(),        icon: Inbox,       color: "text-amber-400",   bg: "bg-amber-500/10",   sub: "delivered, pending" },
        ].map((k) => (
          <Card key={k.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] text-muted-foreground font-medium">{k.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{k.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.bg}`}>
                  <k.icon className={`w-4.5 h-4.5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Historical trend chart */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0 pt-4 px-5">
          <CardTitle className="text-[13px] font-semibold">Reply Rate Trend</CardTitle>
          <CardDescription className="text-xs mt-0.5">Historical reply rate trend</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 px-2 pb-2">
          <div className="h-44">
            {historyLabels.length > 0 ? (
              <ModernAreaChart
                series={[{ name: "Reply Rate %", data: historyRate, color: "#22d3ee" }]}
                categories={historyLabels}
                height="100%"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">
                No history data yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Campaign breakdown */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-0 pt-4 px-5">
          <CardTitle className="text-[13px] font-semibold">Campaign Breakdown</CardTitle>
          <CardDescription className="text-xs mt-0.5">Replies per campaign</CardDescription>
        </CardHeader>
        <CardContent className="pt-3 px-5 pb-4">
          {campaignBreakdown.length === 0 ? (
            <p className="text-[13px] text-muted-foreground text-center py-4">No campaign data yet.</p>
          ) : (
          <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-muted/20 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
            {campaignBreakdown.map((c: any) => (
              <div key={c.name} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[12px] font-medium text-foreground/80 truncate">{c.name}</p>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[11px] text-muted-foreground">{c.sent} sent</span>
                      <Badge className="text-[11px] bg-muted/60 text-muted-foreground border-0">{c.replies} replies</Badge>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-500/40 transition-all"
                      style={{ width: c.sent > 0 ? `${(c.replies / c.sent) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </CardContent>
      </Card>

      {/* Improvement tips */}
      <div>
        <h2 className="text-[13px] font-semibold text-foreground mb-3">How to improve reply rate</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TIPS.map((tip) => (
            <Card key={tip.title} className="overflow-hidden">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${tip.bg}`}>
                  <tip.icon className={`w-4 h-4 ${tip.color}`} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{tip.title}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{tip.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
