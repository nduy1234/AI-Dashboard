import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3, DollarSign, CalendarCheck, Eye, Reply, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  getAnalyticsOverview,
  getAnalyticsCampaigns,
  getGetAnalyticsOverviewQueryKey,
  getGetAnalyticsCampaignsQueryKey,
  type CampaignAnalytics,
} from "@workspace/api-client-react";
import { ModernAreaChart, ModernLineChart, ModernBarChart, ModernRadialChart } from "@/components/molecules/charts";
import { useState } from "react";


export default function Analytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: getGetAnalyticsOverviewQueryKey(),
    queryFn: () => getAnalyticsOverview(undefined, { credentials: "include" }),
  });
  const { data: campaignAnalytics, isLoading: campaignsLoading } = useQuery({
    queryKey: getGetAnalyticsCampaignsQueryKey(),
    queryFn: () => getAnalyticsCampaigns({ credentials: "include" }),
  });

  const openHistory    = (overview?.openRateHistory    ?? []) as { label: string; value: number }[];
  const replyHistory   = (overview?.replyRateHistory   ?? []) as { label: string; value: number }[];
  const meetHistory    = (overview?.meetingsHistory    ?? []) as { label: string; value: number }[];
  const revHistory     = (overview?.revenueHistory     ?? []) as { label: string; value: number }[];

  const openLabels  = openHistory.map(r => r.label);
  const openVals    = openHistory.map(r => r.value);
  const replyLabels = replyHistory.map(r => r.label);
  const replyVals   = replyHistory.map(r => r.value);
  const meetLabels  = meetHistory.map(r => r.label);
  const meetVals    = meetHistory.map(r => r.value);
  const revLabels   = revHistory.map(r => r.label);
  const revVals     = revHistory.map(r => r.value);

  const emailsSent = overview?.emailsSent ?? 0;
  const openRate   = overview?.openRate   ?? 0;
  const replyRate  = overview?.replyRate  ?? 0;
  const meetings   = overview?.meetingsBooked ?? 0;
  const meetPct    = emailsSent ? Math.round((meetings / emailsSent) * 10000) / 100 : 0;

  const kpis = [
    { label: "Open Rate",         value: `${openRate}%`,                                                icon: Eye,           color: "text-primary",    bg: "bg-primary/10"     },
    { label: "Reply Rate",        value: `${replyRate}%`,                                               icon: Reply,         color: "text-violet-500", bg: "bg-violet-500/10"  },
    { label: "Meetings Booked",   value: meetings.toString(),                                           icon: CalendarCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Revenue Generated", value: `$${((overview?.revenueGenerated ?? 0) / 1000).toFixed(1)}k`, icon: DollarSign,    color: "text-amber-500",  bg: "bg-amber-500/10"   },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-foreground">Analytics &amp; Attribution</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Track performance across all AI agents and campaigns.</p>
        </div>
        <Badge variant="outline" className="self-start text-[10px] font-semibold border-primary/30 text-primary bg-primary/5 px-2 py-0.5 rounded-full shrink-0">
          <TrendingUp className="w-3 h-3 mr-1" />
          Live Data
        </Badge>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-muted-foreground font-medium mb-1">{kpi.label}</p>
                  <p className="text-2xl font-bold text-foreground">
                    {overviewLoading ? <span className="text-muted-foreground text-base">...</span> : kpi.value}
                  </p>
                  <p className="text-[11px] mt-1 font-medium text-muted-foreground">
                    All time
                  </p>
                </div>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${kpi.bg}`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaign Performance</TabsTrigger>
          <TabsTrigger value="funnel">Conversion Funnel</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="overflow-hidden">
              <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="text-[13px] font-semibold">Open Rate Trend</CardTitle>
                <CardDescription className="text-xs mt-0.5">Email open rates over time (%)</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 px-2 pb-2">
                {overviewLoading ? (
                  <div className="h-[240px] m-3 rounded-lg shimmer" />
                ) : (
                  <ModernAreaChart
                    series={[{ name: "Open Rate", data: openVals, color: "#7c6ff7" }]}
                    categories={openLabels}
                    height={240}
                    yUnit="%"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="text-[13px] font-semibold">Reply Rate Trend</CardTitle>
                <CardDescription className="text-xs mt-0.5">Email reply rates over time (%)</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 px-2 pb-2">
                {overviewLoading ? (
                  <div className="h-[240px] m-3 rounded-lg shimmer" />
                ) : (
                  <ModernLineChart
                    series={[{ name: "Reply Rate", data: replyVals, color: "#a78bfa" }]}
                    categories={replyLabels}
                    height={240}
                    yUnit="%"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="text-[13px] font-semibold">Meetings Booked</CardTitle>
                <CardDescription className="text-xs mt-0.5">Monthly meeting bookings from AI sequence</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 px-2 pb-2">
                {overviewLoading ? (
                  <div className="h-[240px] m-3 rounded-lg shimmer" />
                ) : (
                  <ModernBarChart
                    series={[{ name: "Meetings", data: meetVals, color: "#34d399" }]}
                    categories={meetLabels}
                    height={240}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="text-[13px] font-semibold">Revenue Generated</CardTitle>
                <CardDescription className="text-xs mt-0.5">Monthly revenue from AI-driven pipeline</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 px-2 pb-2">
                {overviewLoading ? (
                  <div className="h-[240px] m-3 rounded-lg shimmer" />
                ) : (
                  <ModernAreaChart
                    series={[{ name: "Revenue", data: revVals, color: "#10b981" }]}
                    categories={revLabels}
                    height={240}
                    yUnit="$"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Campaigns tab */}
        <TabsContent value="campaigns" className="mt-4">
          <Card>
            <CardHeader className="pt-4 px-5 pb-3">
              <CardTitle className="text-[13px] font-semibold">Campaign Performance Breakdown</CardTitle>
              <CardDescription className="text-xs mt-0.5">Detailed metrics for each campaign.</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {campaignsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 shimmer rounded-lg" />)}
                </div>
              ) : (campaignAnalytics ?? []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No campaign data available yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Opened</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Replied</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Meetings</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(campaignAnalytics ?? []).map((c: CampaignAnalytics) => (
                      <TableRow key={c.campaignId}>
                        <TableCell className="font-medium text-[13px]">{c.campaignName}</TableCell>
                        <TableCell className="text-right text-[13px]">{c.sent?.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-[13px]">{c.opened?.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-[13px] hidden sm:table-cell">{c.replied?.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-[13px] hidden sm:table-cell">{c.meetings}</TableCell>
                        <TableCell className="text-right text-[13px] text-emerald-500 font-medium">${c.revenue?.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Funnel tab */}
        <TabsContent value="funnel" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="overflow-hidden">
              <CardHeader className="pt-4 px-5 pb-0">
                <CardTitle className="text-[13px] font-semibold">Pipeline Conversion Rates</CardTitle>
                <CardDescription className="text-xs mt-0.5">Radial view of each conversion stage</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 px-2 pb-2">
                <ModernRadialChart
                  series={[
                    { label: "Open Rate",    value: openRate,  color: "#7c6ff7" },
                    { label: "Reply Rate",   value: replyRate, color: "#a78bfa" },
                    { label: "Meeting Rate", value: meetPct,   color: "#34d399" },
                  ]}
                  height={300}
                />
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="pt-4 px-5 pb-0">
                <CardTitle className="text-[13px] font-semibold">Stage-by-Stage Funnel</CardTitle>
                <CardDescription className="text-xs mt-0.5">Volume drop from prospects to meetings</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 px-2 pb-2">
                <ModernBarChart
                  series={[{ name: "Count", data: [emailsSent, Math.round(emailsSent * openRate / 100), Math.round(emailsSent * replyRate / 100), meetings] }]}
                  categories={["Sent", "Opened", "Replied", "Meetings"]}
                  horizontal={false}
                  height={300}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
