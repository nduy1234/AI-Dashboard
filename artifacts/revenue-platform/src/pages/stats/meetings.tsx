import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  CalendarCheck, ArrowLeft, ChevronLeft, ChevronRight, Clock,
  Video, Users, MapPin, ExternalLink, CheckCircle2, Calendar,
  Phone, Building2, TrendingUp, Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Meeting data ─────────────────────────────────────────────────────────────
// April 2026 — 8 meetings booked
const MEETINGS = [
  {
    id: 1, date: 2,  day: "Thu", time: "10:00 AM", duration: 30,
    title: "Discovery Call",
    attendee: "Sarah Johnson", company: "TechCorp Inc", title_: "VP of Sales",
    type: "video", status: "completed", campaign: "Tech Outbound Q2",
    email: "sarah@techcorp.io", notes: "Discussed AI pipeline acceleration. Interested in pilot.",
    avatar: "SJ",
  },
  {
    id: 2, date: 4,  day: "Sat", time: "2:00 PM",  duration: 45,
    title: "Product Demo",
    attendee: "Mike Chen", company: "DataFlow Ltd", title_: "Head of Engineering",
    type: "video", status: "completed", campaign: "Tech Outbound Q2",
    email: "mchen@dataflow.co", notes: "Showed live agent loop. Mike excited about MCP trust gates.",
    avatar: "MC",
  },
  {
    id: 3, date: 7,  day: "Tue", time: "11:30 AM", duration: 30,
    title: "Strategic Review",
    attendee: "Lisa Park", company: "ScaleUp AI", title_: "Chief Revenue Officer",
    type: "video", status: "completed", campaign: "AI Founders Series",
    email: "lpark@scaleupai.com", notes: "Reviewed current outbound stack. Strong fit for AI enrichment.",
    avatar: "LP",
  },
  {
    id: 4, date: 9,  day: "Thu", time: "9:00 AM",  duration: 30,
    title: "Pricing Discussion",
    attendee: "David Kim", company: "PropTech Hub", title_: "CTO",
    type: "phone", status: "completed", campaign: "Real Estate Tech",
    email: "dkim@proptechhub.com", notes: "Asked about enterprise tier. Budget approved by leadership.",
    avatar: "DK",
  },
  {
    id: 5, date: 11, day: "Sat", time: "3:30 PM",  duration: 45,
    title: "Technical Review",
    attendee: "Natasha Brown", company: "HealthStack", title_: "VP Engineering",
    type: "video", status: "completed", campaign: "HealthTech Outreach",
    email: "nbrown@healthstack.io", notes: "Walked through API integrations. Security review requested.",
    avatar: "NB",
  },
  {
    id: 6, date: 15, day: "Wed", time: "10:30 AM", duration: 60,
    title: "Contract Review",
    attendee: "Carlos Mendez", company: "RetailAI Corp", title_: "COO",
    type: "video", status: "upcoming", campaign: "Retail Automation",
    email: "carlos@retailai.com", notes: "Legal reviewing SaaS agreement. Decision expected this week.",
    avatar: "CM",
  },
  {
    id: 7, date: 17, day: "Fri", time: "1:00 PM",  duration: 30,
    title: "Pilot Program Kick-off",
    attendee: "Emma Thompson", company: "GrowthLab", title_: "Head of Marketing",
    type: "video", status: "upcoming", campaign: "Marketing Leaders",
    email: "emma@growthlab.co", notes: "Pilot scope: 50 leads via Clay + Resend. 2-week test.",
    avatar: "ET",
  },
  {
    id: 8, date: 22, day: "Wed", time: "4:00 PM",  duration: 45,
    title: "Quarterly Strategy Alignment",
    attendee: "Jordan Williams", company: "CloudVentures", title_: "VP Partnerships",
    type: "video", status: "upcoming", campaign: "Cloud Leaders",
    email: "jwill@cloudventures.io", notes: "Exploring multi-product partnership for Q3.",
    avatar: "JW",
  },
];

// ─── April 2026 calendar config ───────────────────────────────────────────────
// April 1 2026 = Wednesday (3). Days: Sun=0…Sat=6.
const MONTH_YEAR    = "April 2026";
const DAYS_IN_MONTH = 30;
const FIRST_DOW     = 3; // Wednesday = 3 (Sun-based index)
const WEEKDAYS      = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_CONFIG = {
  video: { label: "Video",  icon: Video, color: "text-primary",    bg: "bg-primary/10"  },
  phone: { label: "Phone",  icon: Phone, color: "text-cyan-400",   bg: "bg-cyan-500/10" },
  inperson: { label: "In Person", icon: MapPin, color: "text-amber-400", bg: "bg-amber-500/10" },
};

const STATUS_CONFIG = {
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-400" },
  upcoming:  { label: "Upcoming",  color: "bg-blue-500/10 text-blue-400"       },
  cancelled: { label: "Cancelled", color: "bg-red-500/10 text-red-400"         },
};

// Build date → meetings map
const DATES_WITH_MEETINGS: Record<number, typeof MEETINGS> = {};
MEETINGS.forEach(m => {
  if (!DATES_WITH_MEETINGS[m.date]) DATES_WITH_MEETINGS[m.date] = [];
  DATES_WITH_MEETINGS[m.date].push(m);
});

export default function MeetingsDetail() {
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<typeof MEETINGS[0] | null>(null);

  const selectedDateMeetings = selectedDate ? (DATES_WITH_MEETINGS[selectedDate] ?? []) : [];

  // Build calendar cells: blanks for padding + day numbers
  const totalCells = FIRST_DOW + DAYS_IN_MONTH;
  const rows = Math.ceil(totalCells / 7);

  const today = 13; // April 13, 2026 (current date per context)

  const kpis = [
    { label: "Total Meetings",    value: "8",  icon: CalendarCheck, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Completed",         value: "5",  icon: CheckCircle2,  color: "text-primary",     bg: "bg-primary/10"    },
    { label: "Upcoming",          value: "3",  icon: Calendar,      color: "text-blue-400",    bg: "bg-blue-500/10"   },
    { label: "Avg Duration",      value: "40m", icon: Clock,        color: "text-amber-400",   bg: "bg-amber-500/10"  },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6 relative">
      <div className="absolute -top-24 -left-10 w-72 h-72 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
      <div className="absolute top-60 -right-10 w-56 h-56 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

      {/* Dark gradient hero header */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card card-shadow-md">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent pointer-events-none" />
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md hover:bg-muted/60">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Meetings</h1>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[11px] font-semibold">8 Booked</Badge>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">All booked meetings from your AI outbound campaigns.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-[13px] gap-1.5">
          <ExternalLink className="w-3.5 h-3.5" /> Open Cal.com
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
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${k.bg}`}>
                  <k.icon className={`w-4.5 h-4.5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calendar + detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 pt-4 px-5 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-md hover:bg-muted/60 opacity-30 cursor-not-allowed" disabled>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <CardTitle className="text-[14px] font-semibold px-1">{MONTH_YEAR}</CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-md hover:bg-muted/60 opacity-30 cursor-not-allowed" disabled>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Completed</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Upcoming</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map(d => (
                  <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground/60 py-1">{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-px bg-border/30 rounded-lg overflow-hidden">
                {Array.from({ length: rows * 7 }).map((_, idx) => {
                  const dayNum = idx - FIRST_DOW + 1;
                  const isValid   = dayNum >= 1 && dayNum <= DAYS_IN_MONTH;
                  const hasMeet   = isValid && !!DATES_WITH_MEETINGS[dayNum];
                  const dayMeets  = isValid ? (DATES_WITH_MEETINGS[dayNum] ?? []) : [];
                  const isToday   = dayNum === today;
                  const isSelected = selectedDate === dayNum;
                  const allCompleted = dayMeets.every(m => m.status === "completed");
                  const hasUpcoming  = dayMeets.some(m => m.status === "upcoming");

                  return (
                    <div
                      key={idx}
                      onClick={() => isValid && hasMeet ? setSelectedDate(isSelected ? null : dayNum) : undefined}
                      className={cn(
                        "relative min-h-[64px] p-1.5 bg-card transition-all",
                        isValid ? "cursor-default" : "bg-muted/10",
                        isValid && hasMeet && "cursor-pointer hover:bg-muted/40",
                        isSelected && hasMeet && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                      )}
                    >
                      {isValid && (
                        <>
                          {/* Day number */}
                          <div className={cn(
                            "w-6 h-6 flex items-center justify-center text-[12px] font-semibold rounded-full mb-1",
                            isToday  ? "bg-primary text-white" : "text-foreground/70",
                          )}>
                            {dayNum}
                          </div>

                          {/* Meeting dots / pills */}
                          {dayMeets.slice(0, 2).map((m, mi) => (
                            <div
                              key={mi}
                              onClick={(e) => { e.stopPropagation(); setSelectedMeeting(m); setSelectedDate(dayNum); }}
                              className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded-sm truncate mb-0.5 cursor-pointer transition-opacity hover:opacity-80",
                                m.status === "completed" ? "bg-emerald-500/15 text-emerald-400" : "bg-blue-500/15 text-blue-400"
                              )}
                            >
                              {m.time.replace(" AM","a").replace(" PM","p")} {m.attendee.split(" ")[0]}
                            </div>
                          ))}
                          {dayMeets.length > 2 && (
                            <div className="text-[10px] text-muted-foreground pl-1">+{dayMeets.length - 2} more</div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detail panel */}
        <div className="space-y-3">
          {selectedMeeting ? (
            <motion.div
              key={selectedMeeting.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="overflow-hidden border-l-4 border-l-emerald-500">
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-[14px] font-bold text-foreground">{selectedMeeting.title}</CardTitle>
                      <Badge className={`text-[10px] mt-1 ${STATUS_CONFIG[selectedMeeting.status as keyof typeof STATUS_CONFIG]?.color ?? ""}`}>
                        {STATUS_CONFIG[selectedMeeting.status as keyof typeof STATUS_CONFIG]?.label}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setSelectedMeeting(null)}>
                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-4">
                  {/* Attendee */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[13px] font-bold shrink-0">
                      {selectedMeeting.avatar}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{selectedMeeting.attendee}</p>
                      <p className="text-[11px] text-muted-foreground">{selectedMeeting.title_}</p>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="space-y-2">
                    {([
                      { icon: Building2,    label: selectedMeeting.company },
                      { icon: Clock,        label: `Apr ${selectedMeeting.date}, ${selectedMeeting.time} · ${selectedMeeting.duration} min` },
                      { icon: TYPE_CONFIG[selectedMeeting.type as keyof typeof TYPE_CONFIG]?.icon ?? Video, label: TYPE_CONFIG[selectedMeeting.type as keyof typeof TYPE_CONFIG]?.label ?? selectedMeeting.type },
                      { icon: Mail,         label: selectedMeeting.email },
                      { icon: CalendarCheck, label: selectedMeeting.campaign },
                    ] as { icon: React.ElementType; label: string }[]).map((row, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <row.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                        <span className="truncate">{row.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  {selectedMeeting.notes && (
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1">Notes</p>
                      <p className="text-[12px] text-foreground/80 leading-relaxed">{selectedMeeting.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="p-6 flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
                  <CalendarCheck className="w-5 h-5 text-muted-foreground/40" />
                </div>
                <p className="text-[13px] font-medium text-foreground/60">Select a meeting</p>
                <p className="text-[12px] text-muted-foreground">Click any highlighted date or meeting pill to see full details.</p>
              </CardContent>
            </Card>
          )}

          {/* All meetings quick list */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">All Meetings</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3 space-y-0.5">
              {MEETINGS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedMeeting(m); setSelectedDate(m.date); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors hover:bg-muted/50",
                    selectedMeeting?.id === m.id && "bg-primary/5"
                  )}
                >
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    m.status === "completed" ? "bg-emerald-400" : "bg-blue-400"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-foreground truncate">{m.attendee}</p>
                    <p className="text-[11px] text-muted-foreground">Apr {m.date} · {m.time}</p>
                  </div>
                  <Badge className={`text-[10px] shrink-0 ${STATUS_CONFIG[m.status as keyof typeof STATUS_CONFIG]?.color ?? ""}`}>
                    {STATUS_CONFIG[m.status as keyof typeof STATUS_CONFIG]?.label}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
