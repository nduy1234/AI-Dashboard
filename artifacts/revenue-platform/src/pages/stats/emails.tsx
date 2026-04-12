import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Mail, ArrowLeft, Search, Filter, CheckCircle2, XCircle, Eye,
  Reply, Clock, ChevronLeft, ChevronRight, Send, AlertCircle,
  MailOpen, Ban, Download, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModernAreaChart } from "@/components/molecules/charts";

const EMAILS = [
  { id: 1,  to: "sarah@techcorp.io",    name: "Sarah Johnson",   subject: "Streamline your sales pipeline with AI",       campaign: "Tech Outbound Q2",      sentAt: "Apr 13, 10:04 AM", status: "delivered", opened: false, replied: false },
  { id: 2,  to: "mchen@dataflow.co",    name: "Mike Chen",       subject: "How DataFlow can 3x their lead velocity",      campaign: "Tech Outbound Q2",      sentAt: "Apr 13, 10:12 AM", status: "delivered", opened: false, replied: false },
  { id: 3,  to: "lpark@scaleupai.com",  name: "Lisa Park",       subject: "AI revenue ops for fast-growing teams",        campaign: "AI Founders Series",    sentAt: "Apr 13, 10:21 AM", status: "delivered", opened: false, replied: false },
  { id: 4,  to: "jwill@cloudventures.io", name: "Jordan Williams", subject: "Your cloud infrastructure deserves better",  campaign: "Cloud Leaders",         sentAt: "Apr 12, 3:15 PM",  status: "delivered", opened: false, replied: false },
  { id: 5,  to: "priya@nexgen.co",      name: "Priya Patel",     subject: "Re: fintech automation opportunity",           campaign: "Fintech Decision Makers", sentAt: "Apr 12, 3:22 PM", status: "delivered", opened: false, replied: false },
  { id: 6,  to: "arivera@venturex.com", name: "Alex Rivera",     subject: "How VentureX portfolio could benefit from AI", campaign: "VC Partnership",        sentAt: "Apr 12, 3:35 PM",  status: "bounced",   opened: false, replied: false },
  { id: 7,  to: "emma@growthlab.co",    name: "Emma Thompson",   subject: "Automate your demand gen with AI agents",      campaign: "Marketing Leaders",     sentAt: "Apr 11, 11:00 AM", status: "delivered", opened: false, replied: false },
  { id: 8,  to: "dkim@proptechhub.com", name: "David Kim",       subject: "PropTech leadership meets AI-driven outbound", campaign: "Real Estate Tech",      sentAt: "Apr 11, 11:08 AM", status: "delivered", opened: false, replied: false },
  { id: 9,  to: "nbrown@healthstack.io", name: "Natasha Brown",  subject: "Scaling HealthStack's pipeline the smart way", campaign: "HealthTech Outreach",   sentAt: "Apr 11, 11:15 AM", status: "delivered", opened: false, replied: false },
  { id: 10, to: "carlos@retailai.com",  name: "Carlos Mendez",   subject: "AI-powered outbound for RetailAI",             campaign: "Retail Automation",     sentAt: "Apr 10, 2:00 PM",  status: "delivered", opened: false, replied: false },
  { id: 11, to: "gwu@devhub.io",        name: "Grace Wu",        subject: "Supercharge DevHub's developer outreach",      campaign: "Dev Tools Growth",      sentAt: "Apr 10, 2:08 PM",  status: "bounced",   opened: false, replied: false },
  { id: 12, to: "omar@capitalflow.com", name: "Omar Hassan",     subject: "Finance leaders are automating their pipeline", campaign: "Finance Leaders",       sentAt: "Apr 10, 2:16 PM",  status: "delivered", opened: false, replied: false },
  { id: 13, to: "idurand@eurotech.fr",  name: "Isabelle Durand", subject: "Enterprise AI outbound for EuroTech",          campaign: "Enterprise EU",         sentAt: "Apr 10, 2:24 PM",  status: "delivered", opened: false, replied: false },
  { id: 14, to: "rscott@alliancehq.com", name: "Ryan Scott",    subject: "Partnership opportunity — 2 min read",         campaign: "Partnership Outreach",  sentAt: "Apr 9, 9:30 AM",   status: "bounced",   opened: false, replied: false },
  { id: 15, to: "mzhang@marketpulse.io", name: "Mei Zhang",     subject: "AI can 10x your demand gen results",           campaign: "Marketing Leaders",     sentAt: "Apr 9, 9:38 AM",   status: "delivered", opened: false, replied: false },
];

// Supplement to reach 54 total (showing 15 in table, rest as +39 more)
const TOTAL_SENT = 54;
const DELIVERED  = 51;
const BOUNCED    = 3;
const OPENED     = 0;
const REPLIED    = 0;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  delivered: { label: "Delivered", color: "bg-emerald-500/10 text-emerald-400", icon: CheckCircle2 },
  bounced:   { label: "Bounced",   color: "bg-red-500/10 text-red-400",         icon: XCircle },
  opened:    { label: "Opened",    color: "bg-blue-500/10 text-blue-400",        icon: MailOpen },
  replied:   { label: "Replied",   color: "bg-violet-500/10 text-violet-400",   icon: Reply },
};

const SEND_VOLUME = {
  labels: ["Apr 6", "Apr 7", "Apr 8", "Apr 9", "Apr 10", "Apr 11", "Apr 12", "Apr 13"],
  data:   [0,       0,       0,       7,       8,        8,         7,        6],
};

export default function EmailsSentDetail() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const filtered = EMAILS.filter(e => {
    const matchTab = tab === "all" || e.status === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || e.name.toLowerCase().includes(q) || e.subject.toLowerCase().includes(q) || e.campaign.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const kpis = [
    { label: "Total Sent",  value: TOTAL_SENT.toString(), icon: Send,        color: "text-primary",    bg: "bg-primary/10",      pct: null },
    { label: "Delivered",   value: DELIVERED.toString(),  icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", pct: `${((DELIVERED/TOTAL_SENT)*100).toFixed(1)}%` },
    { label: "Opens",       value: OPENED.toString(),     icon: MailOpen,    color: "text-blue-400",   bg: "bg-blue-500/10",     pct: `${((OPENED/TOTAL_SENT)*100).toFixed(1)}%` },
    { label: "Bounced",     value: BOUNCED.toString(),    icon: Ban,         color: "text-red-400",    bg: "bg-red-500/10",      pct: `${((BOUNCED/TOTAL_SENT)*100).toFixed(1)}%` },
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
              <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/20 text-[11px] font-semibold">54</Badge>
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
                  <p className="text-2xl font-bold text-foreground mt-0.5">{k.value}</p>
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
      <Card className="overflow-hidden">
        <CardHeader className="pb-0 pt-4 px-5">
          <CardTitle className="text-[13px] font-semibold">Daily Send Volume</CardTitle>
          <CardDescription className="text-xs mt-0.5">Emails sent per day — last 8 days</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 px-2 pb-2">
          <div className="h-40">
            <ModernAreaChart
              series={[{ name: "Sent", data: SEND_VOLUME.data, color: "#7c6ff7" }]}
              categories={SEND_VOLUME.labels}
              height="100%"
            />
          </div>
        </CardContent>
      </Card>

      {/* Zero-reply notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-amber-400">0% Reply Rate</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            54 emails delivered but no replies recorded yet. Emails were sent recently — replies typically arrive within 24–72 hours.
            Consider following up with high-scoring prospects or A/B testing subject lines.
          </p>
        </div>
      </div>

      {/* Email log table */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-5 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <CardTitle className="text-[14px] font-semibold">Email Log</CardTitle>
              <CardDescription className="text-xs mt-0.5">Showing first {EMAILS.length} of {TOTAL_SENT} emails</CardDescription>
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
              {paginated.map((e) => {
                const sc = STATUS_CONFIG[e.status];
                const StatusIcon = sc.icon;
                return (
                  <TableRow key={e.id} className="border-border hover:bg-muted/30 transition-colors">
                    <TableCell className="pl-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center shrink-0 text-[11px] font-bold text-foreground/70">
                          {e.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-foreground">{e.name}</p>
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
                        <Clock className="w-3 h-3" /> {e.sentAt}
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
    </motion.div>
  );
}
