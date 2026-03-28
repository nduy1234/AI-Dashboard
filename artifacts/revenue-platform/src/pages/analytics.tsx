import { motion } from "framer-motion";
import { PageHeader } from "@/components/molecules/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, DollarSign, CalendarCheck, Mail, Eye, Reply, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  getAnalyticsOverview,
  getAnalyticsCampaigns,
  getGetAnalyticsOverviewQueryKey,
  getGetAnalyticsCampaignsQueryKey,
  type CampaignAnalytics,
} from "@workspace/api-client-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { useState } from "react";

export default function Analytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: getGetAnalyticsOverviewQueryKey(),
    queryFn: () => getAnalyticsOverview(),
  });
  const { data: campaignAnalytics, isLoading: campaignsLoading } = useQuery({
    queryKey: getGetAnalyticsCampaignsQueryKey(),
    queryFn: () => getAnalyticsCampaigns(),
  });

  const kpis = [
    { label: "Open Rate", value: `${overview?.openRate ?? 0}%`, icon: Eye, color: "text-blue-400", trend: "+2.3%" },
    { label: "Reply Rate", value: `${overview?.replyRate ?? 0}%`, icon: Reply, color: "text-purple-400", trend: "+1.1%" },
    { label: "Meetings Booked", value: (overview?.meetingsBooked ?? 0).toString(), icon: CalendarCheck, color: "text-green-400", trend: "+8" },
    { label: "Revenue Generated", value: `$${((overview?.revenueGenerated ?? 0) / 1000).toFixed(0)}k`, icon: DollarSign, color: "text-emerald-400", trend: "+12%" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <PageHeader
        title="Analytics & Attribution"
        description="Track performance across all AI agents and campaigns with detailed metrics."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-card/50 border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="text-2xl font-bold mt-1">{overviewLoading ? "..." : kpi.value}</p>
                  <p className="text-xs text-green-400 mt-1">{kpi.trend} vs last month</p>
                </div>
                <kpi.icon className={`h-8 w-8 ${kpi.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaign Performance</TabsTrigger>
          <TabsTrigger value="funnel">Conversion Funnel</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Open Rate Trend</CardTitle>
                <CardDescription>Email open rates over time</CardDescription>
              </CardHeader>
              <CardContent>
                {overviewLoading ? (
                  <div className="h-[250px] bg-muted rounded animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={overview?.openRateHistory ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reply Rate Trend</CardTitle>
                <CardDescription>Email reply rates over time</CardDescription>
              </CardHeader>
              <CardContent>
                {overviewLoading ? (
                  <div className="h-[250px] bg-muted rounded animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={overview?.replyRateHistory ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={{ fill: "#a78bfa" }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Meetings Booked</CardTitle>
                <CardDescription>Monthly meeting bookings</CardDescription>
              </CardHeader>
              <CardContent>
                {overviewLoading ? (
                  <div className="h-[250px] bg-muted rounded animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={overview?.meetingsHistory ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="value" fill="#34d399" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Generated</CardTitle>
                <CardDescription>Monthly revenue from AI-generated pipeline</CardDescription>
              </CardHeader>
              <CardContent>
                {overviewLoading ? (
                  <div className="h-[250px] bg-muted rounded animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={overview?.revenueHistory ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]} />
                      <Area type="monotone" dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Performance Breakdown</CardTitle>
              <CardDescription>Detailed metrics for each campaign.</CardDescription>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
                </div>
              ) : (campaignAnalytics ?? []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No campaign data available yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Opened</TableHead>
                      <TableHead className="text-right">Replied</TableHead>
                      <TableHead className="text-right">Meetings</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(campaignAnalytics ?? []).map((c: CampaignAnalytics) => (
                      <TableRow key={c.campaignId}>
                        <TableCell className="font-medium">{c.campaignName}</TableCell>
                        <TableCell className="text-right">{c.sent?.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{c.opened?.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{c.replied?.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{c.meetings}</TableCell>
                        <TableCell className="text-right text-green-400">${c.revenue?.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="funnel" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>End-to-end pipeline conversion rates.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-w-lg mx-auto py-4">
                {[
                  { stage: "Leads Sourced", count: overview?.emailsSent ?? 0, pct: 100, color: "bg-blue-500" },
                  { stage: "Emails Opened", count: Math.round((overview?.emailsSent ?? 0) * (overview?.openRate ?? 0) / 100), pct: overview?.openRate ?? 0, color: "bg-purple-500" },
                  { stage: "Replies Received", count: Math.round((overview?.emailsSent ?? 0) * (overview?.replyRate ?? 0) / 100), pct: overview?.replyRate ?? 0, color: "bg-green-500" },
                  { stage: "Meetings Booked", count: overview?.meetingsBooked ?? 0, pct: overview?.emailsSent ? Math.round((overview.meetingsBooked / overview.emailsSent) * 10000) / 100 : 0, color: "bg-emerald-500" },
                  { stage: "Deals Closed", count: overview?.leadConversions ?? 0, pct: overview?.emailsSent ? Math.round(((overview.leadConversions ?? 0) / overview.emailsSent) * 10000) / 100 : 0, color: "bg-yellow-500" },
                ].map((item, i) => (
                  <div key={item.stage} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.stage}</span>
                      <span className="text-muted-foreground">{item.count.toLocaleString()} ({item.pct}%)</span>
                    </div>
                    <div className="h-8 bg-muted rounded-lg overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-lg transition-all duration-500`}
                        style={{ width: `${Math.max(item.pct, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
