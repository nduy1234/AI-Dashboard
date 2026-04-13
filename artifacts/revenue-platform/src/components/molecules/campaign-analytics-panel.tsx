import { motion } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Eye,
  Reply,
  CalendarCheck,
  DollarSign,
  TrendingUp,
  ArrowRight,
  BarChart3,
  Target,
} from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CampaignAnalyticsData {
  id: number;
  name: string;
  status: string;
  type: string;
  sentCount: number;
  openCount: number;
  replyCount: number;
  meetingsBooked: number;
}

interface CampaignAnalyticsPanelProps {
  campaign: CampaignAnalyticsData | null;
  open: boolean;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(num: number, denom: number) {
  if (!denom) return 0;
  return Math.round((num / denom) * 10000) / 100;
}

function statusStyles(status: string) {
  if (status === "active")    return { dot: "bg-emerald-400", text: "text-emerald-400", label: "Active" };
  if (status === "paused")    return { dot: "bg-amber-400",   text: "text-amber-400",   label: "Paused" };
  if (status === "completed") return { dot: "bg-blue-400",    text: "text-blue-400",    label: "Completed" };
  if (status === "failed")    return { dot: "bg-red-400",     text: "text-red-400",     label: "Failed" };
  return                             { dot: "bg-white/30",    text: "text-white/50",    label: "Draft" };
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  delay?: number;
}

function StatCard({ label, value, sub, icon: Icon, color, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-3"
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/6 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-white/40">{label}</p>
        <p className="text-sm font-bold text-white leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-white/30">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── Funnel bar ────────────────────────────────────────────────────────────────

interface FunnelRowProps {
  stage: string;
  count: number;
  pct: number;
  color: string;
  delay: number;
}

function FunnelRow({ stage, count, pct: percent, color, delay }: FunnelRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="space-y-1.5"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/60">{stage}</span>
        <span className="text-white/40 tabular-nums">
          {count.toLocaleString()} · {percent}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(percent, 1)}%` }}
          transition={{ delay: delay + 0.1, duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-black/90 px-3 py-2 text-xs backdrop-blur-md">
      <p className="mb-1 text-white/50">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill }} className="font-medium">
          {p.name}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CampaignAnalyticsPanel({ campaign, open, onClose }: CampaignAnalyticsPanelProps) {
  if (!campaign) return null;

  const sent      = campaign.sentCount    ?? 0;
  const opened    = campaign.openCount    ?? 0;
  const replied   = campaign.replyCount   ?? 0;
  const meetings  = campaign.meetingsBooked ?? 0;
  const revenue   = meetings * 2500;
  const openRate  = pct(opened,   sent);
  const replyRate = pct(replied,  sent);
  const bookRate  = pct(meetings, sent);

  const status = statusStyles(campaign.status);

  const chartData = [
    { name: "Sent",     value: sent,     fill: "#6366f1" },
    { name: "Opened",   value: opened,   fill: "#a78bfa" },
    { name: "Replied",  value: replied,  fill: "#34d399" },
    { name: "Meetings", value: meetings, fill: "#10b981" },
  ];

  const funnelRows = [
    { stage: "Emails Sent",        count: sent,     pct: 100,      color: "bg-indigo-500" },
    { stage: "Emails Opened",      count: opened,   pct: openRate,  color: "bg-violet-500" },
    { stage: "Replies Received",   count: replied,  pct: replyRate, color: "bg-purple-500" },
    { stage: "Meetings Booked",    count: meetings, pct: bookRate,  color: "bg-emerald-500" },
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[440px] sm:w-[440px] p-0 border-l border-white/10 bg-black/90 backdrop-blur-xl flex flex-col gap-0"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-white/8">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-white/8">
              <BarChart3 className="h-5 w-5 text-violet-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dot}`} />
                <span className={`text-xs font-medium capitalize ${status.text}`}>
                  {status.label} · {campaign.type}
                </span>
              </div>
              <SheetTitle className="text-base font-semibold text-white leading-snug truncate">
                {campaign.name}
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>

        {/* ── Scrollable body ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label="Emails Sent"     value={sent.toLocaleString()}     icon={Mail}          color="text-indigo-400" delay={0.05} />
            <StatCard label="Open Rate"       value={`${openRate}%`}            sub={`${opened.toLocaleString()} opens`}  icon={Eye}  color="text-violet-400" delay={0.1} />
            <StatCard label="Reply Rate"      value={`${replyRate}%`}           sub={`${replied.toLocaleString()} replies`} icon={Reply} color="text-purple-400" delay={0.15} />
            <StatCard label="Meetings Booked" value={meetings.toLocaleString()} icon={CalendarCheck}  color="text-emerald-400" delay={0.2} />
            <StatCard
              label="Est. Revenue"
              value={`$${(revenue / 1000).toFixed(1)}k`}
              sub="@ $2,500 / meeting"
              icon={DollarSign}
              color="text-green-400"
              delay={0.25}
            />
            <StatCard
              label="Conversion"
              value={`${pct(meetings, sent)}%`}
              sub="sent → meeting"
              icon={Target}
              color="text-pink-400"
              delay={0.3}
            />
          </div>

          {/* Divider */}
          <div className="h-px bg-white/8" />

          {/* Bar chart */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-3.5 w-3.5 text-white/40" />
              <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Performance Breakdown</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/3 p-4">
              {sent === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-white/20">
                  <BarChart3 className="h-8 w-8 mb-2" />
                  <p className="text-xs">No data yet — agent hasn't run</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          {/* Divider */}
          <div className="h-px bg-white/8" />

          {/* Conversion funnel */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-3.5 w-3.5 text-white/40" />
              <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Conversion Funnel</p>
            </div>
            <div className="space-y-3">
              {funnelRows.map((row, i) => (
                <FunnelRow key={row.stage} {...row} delay={0.4 + i * 0.07} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-white/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0"
              onClick={onClose}
            >
              Full Analytics <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
