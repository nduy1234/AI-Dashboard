import React, { useState, useMemo } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { getMeetingsStats, getGetMeetingsStatsQueryKey } from "@workspace/api-client-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export default function MeetingsDetail() {
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: getGetMeetingsStatsQueryKey(),
    queryFn: () => getMeetingsStats({ credentials: "include" }),
  });

  const meetings: any[] = data?.leads ?? [];

  // Build dynamic calendar from meeting scheduledAt dates
  const now = new Date();
  const calYear = now.getFullYear();
  const calMonth = now.getMonth(); // 0-based
  const MONTH_YEAR = now.toLocaleString("default", { month: "long", year: "numeric" });
  const DAYS_IN_MONTH = new Date(calYear, calMonth + 1, 0).getDate();
  const FIRST_DOW = new Date(calYear, calMonth, 1).getDay();
  const today = now.getDate();

  // Build date → meetings map from live data
  const DATES_WITH_MEETINGS = useMemo(() => {
    const map: Record<number, any[]> = {};
    meetings.forEach((m: any) => {
      const d = m.scheduledAt ? new Date(m.scheduledAt) : null;
      if (d && d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(m);
      }
    });
    return map;
  }, [meetings, calYear, calMonth]);

  const selectedDateMeetings = selectedDate ? (DATES_WITH_MEETINGS[selectedDate] ?? []) : [];

  const totalCells = FIRST_DOW + DAYS_IN_MONTH;
  const rows = Math.ceil(totalCells / 7);

  const completed = meetings.filter((m: any) => m.status === "completed" || (m.scheduledAt && new Date(m.scheduledAt) < now)).length;
  const upcoming  = meetings.filter((m: any) => m.status === "upcoming"  || (m.scheduledAt && new Date(m.scheduledAt) >= now)).length;
  const avgDuration = meetings.length
    ? Math.round(meetings.reduce((s: number, m: any) => s + (m.duration ?? 30), 0) / meetings.length)
    : 0;

  const kpis = [
    { label: "Total Meetings", value: meetings.length.toString(), icon: CalendarCheck, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Completed",      value: completed.toString(),       icon: CheckCircle2,  color: "text-primary",    bg: "bg-primary/10"    },
    { label: "Upcoming",       value: upcoming.toString(),        icon: Calendar,      color: "text-blue-400",   bg: "bg-blue-500/10"   },
    { label: "Avg Duration",   value: avgDuration > 0 ? `${avgDuration}m` : "—", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 shimmer rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 shimmer rounded-lg" />)}
        </div>
        <div className="h-[480px] shimmer rounded-lg" />
      </div>
    );
  }

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
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[11px] font-semibold">{meetings.length} Booked</Badge>
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
                  const hasUpcoming  = dayMeets.some((m: any) => m.status === "upcoming" || (m.scheduledAt && new Date(m.scheduledAt) >= now));

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
                          {dayMeets.slice(0, 2).map((m: any, mi: number) => {
                            const mTime = m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }).replace(" AM","a").replace(" PM","p") : "";
                            const mName = [m.firstName, m.lastName].filter(Boolean).join(" ").split(" ")[0] || m.email || "";
                            const isPast = m.scheduledAt ? new Date(m.scheduledAt) < now : false;
                            return (
                              <div
                                key={mi}
                                onClick={(e) => { e.stopPropagation(); setSelectedMeeting(m); setSelectedDate(dayNum); }}
                                className={cn(
                                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-sm truncate mb-0.5 cursor-pointer transition-opacity hover:opacity-80",
                                  isPast ? "bg-emerald-500/15 text-emerald-400" : "bg-blue-500/15 text-blue-400"
                                )}
                              >
                                {mTime} {mName}
                              </div>
                            );
                          })}
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
                      <CardTitle className="text-[14px] font-bold text-foreground">
                        {[selectedMeeting.firstName, selectedMeeting.lastName].filter(Boolean).join(" ") || selectedMeeting.email}
                      </CardTitle>
                      {(() => {
                        const isPast = selectedMeeting.scheduledAt ? new Date(selectedMeeting.scheduledAt) < now : false;
                        const statusKey = isPast ? "completed" : "upcoming";
                        return (
                          <Badge className={`text-[10px] mt-1 ${STATUS_CONFIG[statusKey].color}`}>
                            {STATUS_CONFIG[statusKey].label}
                          </Badge>
                        );
                      })()}
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
                      {([selectedMeeting.firstName, selectedMeeting.lastName].filter(Boolean).map((n: string) => n[0]).join("").slice(0,2).toUpperCase()) || "?"}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{[selectedMeeting.firstName, selectedMeeting.lastName].filter(Boolean).join(" ")}</p>
                      <p className="text-[11px] text-muted-foreground">{selectedMeeting.jobTitle ?? ""}</p>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="space-y-2">
                    {([
                      { icon: Building2,    label: selectedMeeting.company ?? "—" },
                      { icon: Clock,        label: selectedMeeting.scheduledAt ? new Date(selectedMeeting.scheduledAt).toLocaleString() : "—" },
                      { icon: Mail,         label: selectedMeeting.email ?? "—" },
                      { icon: CalendarCheck, label: selectedMeeting.campaignName ?? "—" },
                    ] as { icon: React.ElementType; label: string }[]).map((row, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <row.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                        <span className="truncate">{row.label}</span>
                      </div>
                    ))}
                  </div>
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
              {meetings.length === 0 && (
                <p className="text-[12px] text-muted-foreground text-center py-4">No meetings yet.</p>
              )}
              {meetings.map((m: any) => {
                const isPast = m.scheduledAt ? new Date(m.scheduledAt) < now : false;
                const statusKey = isPast ? "completed" : "upcoming";
                const displayDate = m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString() : "—";
                const displayTime = m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                const mName = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || "Unknown";
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      const d = m.scheduledAt ? new Date(m.scheduledAt) : null;
                      if (d && d.getFullYear() === calYear && d.getMonth() === calMonth) {
                        setSelectedDate(d.getDate());
                      }
                      setSelectedMeeting(m);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors hover:bg-muted/50",
                      selectedMeeting?.id === m.id && "bg-primary/5"
                    )}
                  >
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      isPast ? "bg-emerald-400" : "bg-blue-400"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-foreground truncate">{mName}</p>
                      <p className="text-[11px] text-muted-foreground">{displayDate} · {displayTime}</p>
                    </div>
                    <Badge className={`text-[10px] shrink-0 ${STATUS_CONFIG[statusKey].color}`}>
                      {STATUS_CONFIG[statusKey].label}
                    </Badge>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
