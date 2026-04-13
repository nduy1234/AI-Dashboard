import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Mail, ArrowLeft, Search, CheckCircle2, XCircle,
  Reply, Clock, ChevronLeft, ChevronRight, Send, AlertCircle,
  MailOpen, Ban, Download,
} from "lucide-react";
import { getEmailsStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModernAreaChart } from "@/components/molecules/charts";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  delivered: { label: "Delivered", color: "bg-emerald-500/10 text-emerald-400", icon: CheckCircle2 },
  sent:      { label: "Delivered", color: "bg-emerald-500/10 text-emerald-400", icon: CheckCircle2 },
  bounced:   { label: "Bounced",   color: "bg-red-500/10 text-red-400",         icon: XCircle },
  opened:    { label: "Opened",    color: "bg-blue-500/10 text-blue-400",       icon: MailOpen },
  replied:   { label: "Replied",   color: "bg-violet-500/10 text-violet-400",   icon: Reply },
};

export default function EmailsSentDetail() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const { data, isLoading } = useQuery({
    queryKey: ["stats", "emails"],
    queryFn: () => getEmailsStats({ credentials: "include" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 shimmer rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 shimmer rounded-lg" />)}
        </div>
        <div className="h-56 shimmer rounded-lg" />
        <div className="h-80 shimmer rounded-lg" />
      </div>
    );
  }

  const kpi = data?.kpi ?? { totalSent: 0, delivered: 0, opened: 0, bounced: 0, replied: 0 };
  const sendVolume = data?.sendVolume ?? { labels: [], data: [] };
  const emails = (data?.emails ?? []) as Array<{ id: number; to: string; name: string; subject: string; campaign: string; sentAt: string | null; status: string; opened: boolean; replied: boolean }>;

  const filtered = emails.filter(e => {
    const matchTab = tab === "all" || e.status === tab || (tab === "delivered" && e.status === "sent");
    const q = search.toLowerCase();
    const matchSearch = !q || e.name.toLowerCase().includes(q)
      || e.subject.toLowerCase().includes(q)
      || e.campaign.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const kpis = [
    { label: "Total Sent",  value: kpi.totalSent,  icon: Send,        color: "text-primary",     bg: "bg-primary/10",      pct: null as string | null },
    { label: "Delivered",   value: kpi.delivered,  icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", pct: kpi.totalSent > 0 ? `${((kpi.delivered / kpi.totalSent) * 100).toFixed(1)}%` : null },
    { label: "Opens",       value: kpi.opened,     icon: MailOpen,    color: "text-blue-400",    bg: "bg-blue-500/10",     pct: kpi.totalSent > 0 ? `${((kpi.opened / kpi.totalSent) * 100).toFixed(1)}%` : null },
    { label: "Bounced",     value: kpi.bounced,    icon: Ban,         color: "text-red-400",     bg: "bg-red-500/10",      pct: kpi.totalSent > 0 ? `${((kpi.bounced / kpi.totalSent) * 100).toFixed(1)}%` : null },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6 relative">
      <div className="absolute -top-24 -left-10 w-72 h-72 rounded-full bg-violet-500/5 blur-3xl pointer-events-none" />
      <div className="absolute top-60 -right-10 w-56 h-56 rounded-full bg-violet-500/5 blur-3xl pointer-events-none" />

      {/* Dark gradient hero header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card card-shadow-md">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 via-violet-500/5 to-transparent pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-violet-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md hover:bg-muted/60">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Emails Sent</h1>
        <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-[11px] font-semibold">{kpi.totalSent}</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">Email delivery log and campaign send history.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-[13px] gap-1.5">
          <Download className="w-3.5 h-3.5" /> Export
        </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] text-muted-foreground font-medium">{k.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{k.value.toLocaleString()}</p>
                  {k.pct && <p className="text-[11px] text-muted-foreground mt-0.5">{k.pct} rate</p>}
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.bg}`}>
                  <k.icon className={`w-4.5 h-4.5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Send volume chart */}
      {(sendVolume.labels as string[]).length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-0 pt-4 px-5">
            <CardTitle className="text-[13px] font-semibold">Daily Send Volume</CardTitle>
            <CardDescription className="text-xs mt-0.5">Emails sent per day — last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 px-2 pb-2">
            <div className="h-40">
              <ModernAreaChart
                series={[{ name: "Sent", data: sendVolume.data as number[], color: "#7c6ff7" }]}
                categories={sendVolume.labels as string[]}
                height="100%"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Zero-reply notice */}
      {kpi.replied === 0 && kpi.totalSent > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-400">0% Reply Rate</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {kpi.totalSent} emails delivered but no replies recorded yet. Replies typically arrive within 24–72 hours.
              Consider following up with high-scoring prospects or A/B testing subject lines.
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {kpi.totalSent === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Mail className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-[15px] font-semibold text-foreground/60">No emails sent yet</p>
          <p className="text-[13px] text-muted-foreground mt-1">Launch a campaign to start sending outbound emails.</p>
          <Link href="/campaigns">
            <Button className="mt-4" size="sm">Go to Campaigns</Button>
          </Link>
        </div>
      )}

      {/* Email log table */}
      {emails.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3 pt-4 px-5 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <CardTitle className="text-[14px] font-semibold">Email Log</CardTitle>
                <CardDescription className="text-xs mt-0.5">Showing {emails.length} of {kpi.totalSent} emails</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search emails…"
                    className="pl-8 h-8 text-[13px] w-52 bg-muted/40"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
              </div>
            </div>
            <Tabs value={tab} onValueChange={v => { setTab(v); setPage(1); }} className="mt-3">
              <TabsList className="h-8 gap-0.5 bg-muted/40">
                {["all","delivered","bounced"].map(t => (
                  <TabsTrigger key={t} value={t} className="h-7 text-[12px] px-3 capitalize">{t === "all" ? "All" : STATUS_CONFIG[t]?.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[11px] font-semibold text-muted-foreground pl-5 py-3">Recipient</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground">Subject</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground">Campaign</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground">Sent At</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground pr-5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-[13px] text-muted-foreground">
                      No emails match your filters.
                    </TableCell>
                  </TableRow>
                ) : paginated.map((e) => {
                  const sc = STATUS_CONFIG[e.status] ?? STATUS_CONFIG.delivered;
                  const StatusIcon = sc.icon;
                  const initials = e.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                  const sentLabel = e.sentAt ? new Date(e.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
                  return (
                    <TableRow key={e.id} className="border-border hover:bg-muted/30 transition-colors">
                      <TableCell className="pl-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center shrink-0 text-[11px] font-bold text-foreground/70">
                            {initials || "?"}
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-foreground">{e.name || "Unknown"}</p>
                            <p className="text-[11px] text-muted-foreground">{e.to}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-[13px] text-foreground/90 max-w-xs truncate">{e.subject}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] border-border/60 text-muted-foreground">{e.campaign}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                          <Clock className="w-3 h-3" /> {sentLabel}
                        </div>
                      </TableCell>
                      <TableCell className="pr-5">
                        <Badge className={`text-[11px] font-medium gap-1 ${sc.color}`}>
                          <StatusIcon className="w-3 h-3" />{sc.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                <p className="text-[12px] text-muted-foreground">
                  {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-[12px] px-2 text-muted-foreground">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
