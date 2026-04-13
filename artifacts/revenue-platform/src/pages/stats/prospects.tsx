import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Users, ArrowLeft, Search, Filter, Mail, Phone, Building2,
  Globe, TrendingUp, CheckCircle2, Clock, Star, MoreHorizontal,
  Download, RefreshCw, UserPlus, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { listLeads, getListLeadsQueryKey } from "@workspace/api-client-react";

const SOURCE_COLORS: Record<string, string> = {
  Apollo:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Clay:     "bg-violet-500/10 text-violet-400 border-violet-500/20",
  LinkedIn: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  RB2B:     "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:            { label: "New",            color: "bg-blue-500/10 text-blue-400" },
  contacted:      { label: "Contacted",      color: "bg-yellow-500/10 text-yellow-400" },
  qualified:      { label: "Qualified",      color: "bg-violet-500/10 text-violet-400" },
  replied:        { label: "Replied",        color: "bg-emerald-500/10 text-emerald-400" },
  meeting_booked: { label: "Meeting Booked", color: "bg-green-500/10 text-green-400" },
};

const SCORE_COLOR = (s: number) =>
  s >= 85 ? "text-emerald-400" : s >= 70 ? "text-amber-400" : "text-red-400";

export default function ProspectsDetail() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const { data: leads = [], isLoading } = useQuery({
    queryKey: getListLeadsQueryKey(),
    queryFn: () => listLeads(undefined, { credentials: "include" }),
  });

  const filtered = leads.filter((p: any) => {
    const matchTab = tab === "all" || p.status === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || (p.firstName + " " + p.lastName).toLowerCase().includes(q) ||
      (p.company ?? "").toLowerCase().includes(q) ||
      (p.jobTitle ?? "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Derive source breakdown from live data
  const sourceCounts = leads.reduce((acc: Record<string, number>, l: any) => {
    const src = l.source ?? "Unknown";
    acc[src] = (acc[src] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 7-day threshold for "new this week"
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const stats = [
    { label: "Total Prospects",  value: leads.length.toString(), icon: Users,        color: "text-primary",    bg: "bg-primary/10" },
    { label: "New This Week",    value: leads.filter((l: any) => l.createdAt && new Date(l.createdAt).getTime() > oneWeekAgo).length.toString(), icon: UserPlus, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "Qualified",        value: leads.filter((l: any) => l.status === "qualified").length.toString(), icon: Star, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Meetings Booked",  value: leads.filter((l: any) => l.status === "meeting_booked").length.toString(), icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 shimmer rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 shimmer rounded-lg" />)}
        </div>
        <div className="h-10 shimmer rounded-lg" />
        <div className="h-80 shimmer rounded-lg" />
      </div>
    );
  }

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
              <h1 className="text-xl font-bold text-foreground">Prospects</h1>
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] font-semibold">{leads.length}</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">All prospects tracked across your outbound campaigns.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-[13px] gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button size="sm" className="h-8 text-[13px] gap-1.5 bg-primary hover:bg-primary/90">
            <UserPlus className="w-3.5 h-3.5" /> Add Prospect
          </Button>
        </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] text-muted-foreground font-medium">{s.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{s.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.bg}`}>
                  <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Source breakdown */}
      {Object.keys(sourceCounts).length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(sourceCounts).slice(0, 4).map(([src, count]) => (
            <Card key={src} className="overflow-hidden">
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">Source</p>
                  <p className="text-[13px] font-semibold text-foreground mt-0.5">{src}</p>
                </div>
                <Badge className={`text-[12px] font-bold px-2 py-1 ${SOURCE_COLORS[src] ?? "bg-muted/60 text-muted-foreground"}`}>{count}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-5 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <CardTitle className="text-[14px] font-semibold">All Prospects</CardTitle>
              <CardDescription className="text-xs mt-0.5">{filtered.length} of {leads.length} shown</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search prospects…"
                  className="pl-8 h-8 text-[13px] w-56 bg-muted/40"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]">
                <Filter className="w-3.5 h-3.5" /> Filter
              </Button>
            </div>
          </div>
          <Tabs value={tab} onValueChange={v => { setTab(v); setPage(1); }} className="mt-3">
            <TabsList className="h-8 gap-0.5 bg-muted/40">
              {["all","new","contacted","qualified","replied","meeting_booked"].map(t => (
                <TabsTrigger key={t} value={t} className="h-7 text-[12px] px-3">
                  {t === "all" ? "All" : STATUS_CONFIG[t]?.label ?? t}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[11px] font-semibold text-muted-foreground pl-5 py-3">Prospect</TableHead>
                <TableHead className="text-[11px] font-semibold text-muted-foreground">Company</TableHead>
                <TableHead className="text-[11px] font-semibold text-muted-foreground">Source</TableHead>
                <TableHead className="text-[11px] font-semibold text-muted-foreground">Status</TableHead>
                <TableHead className="text-[11px] font-semibold text-muted-foreground">Score</TableHead>
                <TableHead className="text-[11px] font-semibold text-muted-foreground">Last Activity</TableHead>
                <TableHead className="text-[11px] font-semibold text-muted-foreground pr-5"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((p: any) => {
                const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "Unknown";
                const initials = fullName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                const score = p.leadScore ?? 0;
                const sc = STATUS_CONFIG[p.status as string] ?? { label: p.status ?? "Unknown", color: "bg-muted/60 text-muted-foreground" };
                const lastActivity = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—";
                return (
                  <TableRow key={p.id} className="border-border hover:bg-muted/30 transition-colors">
                    <TableCell className="pl-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary text-[12px] font-bold">
                          {initials}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-foreground">{fullName}</p>
                          <p className="text-[11px] text-muted-foreground">{p.jobTitle ?? ""}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                        <div>
                          <p className="text-[13px] font-medium text-foreground">{p.company ?? "—"}</p>
                          <p className="text-[11px] text-muted-foreground">{p.industry ?? ""}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] border-border/60 text-muted-foreground">{p.source ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[11px] font-medium ${sc.color}`}>{sc.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`text-[13px] font-bold ${SCORE_COLOR(score)}`}>{score || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        <Clock className="w-3 h-3" /> {lastActivity}
                      </div>
                    </TableCell>
                    <TableCell className="pr-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-md hover:bg-muted/60">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem className="text-[13px] gap-2"><Mail className="w-3.5 h-3.5" />Send Email</DropdownMenuItem>
                          <DropdownMenuItem className="text-[13px] gap-2"><Phone className="w-3.5 h-3.5" />Log Call</DropdownMenuItem>
                          <DropdownMenuItem className="text-[13px] gap-2"><Globe className="w-3.5 h-3.5" />View Profile</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-[13px]">
                    No prospects match your filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <p className="text-[12px] text-muted-foreground">
                Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-[12px] text-muted-foreground px-2">{page} / {totalPages}</span>
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
