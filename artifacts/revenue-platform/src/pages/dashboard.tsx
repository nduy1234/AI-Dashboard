import { motion } from "framer-motion";
import { Users, Mail, Reply, CalendarCheck, RefreshCcw, MousePointerClick } from "lucide-react";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { useDashboardStats, useDashboardCharts } from "@/hooks/use-dashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
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
  ComposedChart,
  Line,
  Cell,
} from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: charts, isLoading: chartsLoading } = useDashboardCharts();

  if (statsLoading || chartsLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-12 w-64 bg-muted rounded-lg"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-card border border-border/50 rounded-2xl"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-card border border-border/50 rounded-2xl"></div>
          <div className="h-96 bg-card border border-border/50 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  
  const displayStats = stats || {
    totalProspects: 0,
    emailsSent: 0,
    replyRate: 0,
    meetingsBooked: 0,
    reactivatedLeads: 0,
    websiteConversions: 0
  };

  const displayCharts = charts || {
    outboundPerformance: [],
    pipelineGenerated: [],
    conversionFunnel: []
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <PageHeader 
        title="Revenue Command Center" 
        description="Overview of your autonomous AI agents' performance."
      >
        <Link href="/campaigns">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md">
            New Campaign
          </Button>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard title="Total Prospects" value={displayStats.totalProspects.toLocaleString()} icon={Users} trend={{ value: 12, isPositive: true }} />
        <StatCard title="Emails Sent" value={displayStats.emailsSent.toLocaleString()} icon={Mail} trend={{ value: 8, isPositive: true }} />
        <StatCard title="Avg. Reply Rate" value={`${displayStats.replyRate}%`} icon={Reply} trend={{ value: 1.2, isPositive: true }} />
        <StatCard title="Meetings Booked" value={displayStats.meetingsBooked} icon={CalendarCheck} trend={{ value: 24, isPositive: true }} />
        <StatCard title="CRM Reactivations" value={displayStats.reactivatedLeads} icon={RefreshCcw} trend={{ value: 5, isPositive: true }} />
        <StatCard title="Web Conversions" value={displayStats.websiteConversions} icon={MousePointerClick} trend={{ value: 2, isPositive: false }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Outbound Performance</CardTitle>
            <CardDescription>Emails sent vs Replies over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayCharts.outboundPerformance} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Pipeline Generated</CardTitle>
            <CardDescription>Estimated revenue value from booked meetings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={displayCharts.pipelineGenerated} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    cursor={{ fill: 'hsl(var(--muted))' }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Line type="monotone" dataKey="value2" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--background))", strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader>
          <CardTitle>Conversion Funnel</CardTitle>
          <CardDescription>Website visitor to closed deal pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={displayCharts.conversionFunnel}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 80, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                <YAxis type="category" dataKey="stage" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} width={70} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={32}>
                  {displayCharts.conversionFunnel.map((_: { stage: string; count: number }, index: number) => {
                    const colors = [
                      "hsl(var(--primary))",
                      "hsl(var(--accent))",
                      "#22c55e",
                      "#f59e0b",
                      "#ef4444",
                    ];
                    return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
