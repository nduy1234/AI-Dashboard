import { motion } from "framer-motion";
import { Users, Mail, Reply, CalendarCheck, RefreshCcw, MousePointerClick } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
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
  Line
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
    totalProspects: 12450,
    emailsSent: 45200,
    replyRate: 4.2,
    meetingsBooked: 142,
    reactivatedLeads: 85,
    websiteConversions: 312
  };

  const mockChartData = [
    { label: "Jan", value: 4000, value2: 2400 },
    { label: "Feb", value: 3000, value2: 1398 },
    { label: "Mar", value: 2000, value2: 9800 },
    { label: "Apr", value: 2780, value2: 3908 },
    { label: "May", value: 1890, value2: 4800 },
    { label: "Jun", value: 2390, value2: 3800 },
  ];

  const displayCharts = charts || {
    outboundPerformance: mockChartData,
    pipelineGenerated: mockChartData,
    conversionFunnel: [
      { stage: "Visitors", count: 5000 },
      { stage: "Chat Engaged", count: 1200 },
      { stage: "Qualified", count: 400 },
      { stage: "Meetings", count: 85 }
    ]
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
    </motion.div>
  );
}
