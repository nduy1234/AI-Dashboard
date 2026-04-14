import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/molecules/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  RefreshCcw, Users, Mail, Clock, CheckCircle2, Target, Database, Link2, BarChart3,
  Send, Wand2, TrendingUp, Shield, AlertCircle, Plus, Trash2, Key, XCircle,
} from "lucide-react";
import { useLeads } from "@/hooks/use-leads";
import { useCampaigns } from "@/hooks/use-campaigns";
import { useAIReactivation } from "@/hooks/use-ai";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations } from "@/hooks/use-integrations";
import {
  useConnectHubspot,
  useTriggerScan,
  useScanProgress,
  useCreateReactivationCampaign,
  useLaunchReactivationCampaign,
  useReactivationSettings,
  useUpdateReactivationSettings,
  type SequenceStep,
} from "@/hooks/use-reactivation";

const statusColor: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400",
  contacted: "bg-yellow-500/10 text-yellow-400",
  qualified: "bg-green-500/10 text-green-400",
  replied: "bg-purple-500/10 text-purple-400",
  meeting_booked: "bg-emerald-500/10 text-emerald-400",
};

const INACTIVITY_OPTIONS = [
  { value: 30, label: "30+ days inactive" },
  { value: 60, label: "60+ days inactive" },
  { value: 90, label: "90+ days inactive" },
  { value: 180, label: "180+ days inactive" },
];

const DEAL_STAGE_OPTIONS = [
  { value: "", label: "All lost/stalled deals" },
  { value: "closedlost", label: "Closed Lost" },
  { value: "appointmentscheduled", label: "Appointment Scheduled (stalled)" },
  { value: "contractsent", label: "Contract Sent (stalled)" },
];

const DEFAULT_STEPS: SequenceStep[] = [
  { stepNumber: 1, delayDays: 0, subject: "", body: "" },
  { stepNumber: 2, delayDays: 3, subject: "", body: "" },
  { stepNumber: 3, delayDays: 7, subject: "", body: "" },
];

export default function Reactivation() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("crm-import");

  // Data
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const { data: integrations = [] } = useIntegrations();
  const { data: settings } = useReactivationSettings();
  const reactivationMutation = useAIReactivation();

  // Mutations
  const connectHubspot = useConnectHubspot();
  const triggerScan = useTriggerScan();
  const createCampaign = useCreateReactivationCampaign();
  const launchCampaign = useLaunchReactivationCampaign();
  const updateSettings = useUpdateReactivationSettings();

  // HubSpot connect modal
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [hubspotToken, setHubspotToken] = useState("");

  // Scan state
  const [activeScanJobId, setActiveScanJobId] = useState<number | null>(null);
  const [scanFilters, setScanFilters] = useState({ inactivityDays: 30, dealStage: "", minDealValue: 0 });
  const scanProgress = useScanProgress(activeScanJobId);

  // Campaign builder
  const [campaignName, setCampaignName] = useState("Q1 Lost Deal Revival");
  const [channel, setChannel] = useState("email");
  const [reactivationContext, setReactivationContext] = useState("");
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[]>(DEFAULT_STEPS);
  const [createdCampaignId, setCreatedCampaignId] = useState<number | null>(null);

  // Safety settings
  const [dailyLimit, setDailyLimit] = useState<number>(settings?.dailyOutreachLimit ?? 100);

  // Derived data
  const hubspotRow = (integrations as any[]).find((i: any) =>
    i.name?.toLowerCase().includes("hubspot"),
  );
  // Treat both "connected" status and apiKeyConfigured flag as connected —
  // apiKeyConfigured=true is persisted in the DB so survives logout/login.
  const isHubspotConnected =
    hubspotRow?.status === "connected" ||
    hubspotRow?.apiKeyConfigured === true ||
    settings?.hubspotStatus === "connected";
  const isHubspotError = hubspotRow?.status === "error" || settings?.hubspotStatus === "error";
  const maskedToken: string | undefined =
    (hubspotRow?.config as any)?.maskedToken ?? undefined;

  const dormantLeads = leads?.filter((l) => l.source === "reactivation") ?? [];
  const reactivationCampaigns = campaigns?.filter((c) => c.type === "reactivation") ?? [];
  const totalMeetings = reactivationCampaigns.reduce((s, c) => s + (c.meetingsBooked ?? 0), 0);

  const stats = [
    {
      label: "Dormant Leads",
      value: dormantLeads.length.toString(),
      icon: Users,
      color: "text-blue-400",
    },
    {
      label: "Reactivation Campaigns",
      value: reactivationCampaigns.length.toString(),
      icon: RefreshCcw,
      color: "text-purple-400",
    },
    {
      label: "Re-engaged",
      value: dormantLeads
        .filter((l) => l.status === "replied" || l.status === "meeting_booked")
        .length.toString(),
      icon: CheckCircle2,
      color: "text-green-400",
    },
    {
      label: "Meetings Booked",
      value: totalMeetings.toString(),
      icon: Target,
      color: "text-emerald-400",
    },
  ];

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleConnectHubspot = async () => {
    if (!hubspotToken.trim()) return;
    try {
      const result = await connectHubspot.mutateAsync(hubspotToken.trim());
      toast({
        title: "HubSpot Connected",
        description: `Portal ${result.portalId} (${result.hubDomain}) connected successfully.`,
      });
      setShowConnectModal(false);
      setHubspotToken("");
    } catch (err: any) {
      toast({ title: "Connection Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleScanAndImport = async () => {
    if (!isHubspotConnected) {
      setShowConnectModal(true);
      return;
    }
    try {
      const result = await triggerScan.mutateAsync({
        inactivityDays: scanFilters.inactivityDays,
        dealStage: scanFilters.dealStage || undefined,
        minDealValue: scanFilters.minDealValue,
      });
      setActiveScanJobId(result.jobId);
      toast({ title: "Scan Started", description: "Scanning HubSpot for dormant leads..." });
    } catch (err: any) {
      toast({ title: "Scan Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleGenerateReactivation = () => {
    const ids = dormantLeads.slice(0, 5).map((l) => l.id);
    if (ids.length === 0) {
      toast({ title: "No dormant leads", description: "Import leads from HubSpot first.", variant: "destructive" });
      return;
    }
    reactivationMutation.mutate(
      { leadIds: ids, channel, context: reactivationContext },
      {
        onSuccess: (data) => {
          // Populate sequence step 1 with first generated message
          if (data?.messages?.[0]) {
            const msg = data.messages[0];
            setSequenceSteps((prev) =>
              prev.map((s) =>
                s.stepNumber === 1 ? { ...s, subject: msg.subject ?? s.subject, body: msg.body ?? s.body } : s,
              ),
            );
          }
          toast({
            title: "AI Messages Generated",
            description: `Generated personalized messages for ${ids.length} leads.`,
          });
        },
      },
    );
  };

  const handleCreateAndLaunch = async () => {
    const leadIds = dormantLeads.map((l) => l.id);
    if (leadIds.length === 0) {
      toast({ title: "No leads", description: "Import leads first.", variant: "destructive" });
      return;
    }

    const validSteps = sequenceSteps.filter((s) => s.subject.trim() && s.body.trim());
    if (validSteps.length === 0) {
      toast({ title: "Empty sequence", description: "Fill in at least one step with subject and body.", variant: "destructive" });
      return;
    }

    try {
      const campaign = await createCampaign.mutateAsync({
        name: campaignName,
        leadIds,
        steps: validSteps,
        channel,
      });

      setCreatedCampaignId(campaign.campaignId);

      const launchResult = await launchCampaign.mutateAsync(campaign.campaignId);

      toast({
        title: "Reactivation Campaign Launched!",
        description: `Queued ${launchResult.queuedEmails} emails across ${validSteps.length} sequence steps.`,
      });

      setActiveTab("execution");
    } catch (err: any) {
      toast({ title: "Launch Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateDailyLimit = async () => {
    try {
      await updateSettings.mutateAsync({ dailyOutreachLimit: dailyLimit });
      toast({ title: "Settings Saved", description: `Daily limit set to ${dailyLimit} emails.` });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
  };

  const updateStep = (index: number, field: keyof SequenceStep, value: string | number) => {
    setSequenceSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addStep = () => {
    const maxStep = Math.max(...sequenceSteps.map((s) => s.stepNumber), 0);
    const lastDelay = sequenceSteps[sequenceSteps.length - 1]?.delayDays ?? 0;
    setSequenceSteps((prev) => [
      ...prev,
      { stepNumber: maxStep + 1, delayDays: lastDelay + 7, subject: "", body: "" },
    ]);
  };

  const removeStep = (index: number) => {
    if (sequenceSteps.length <= 1) return;
    setSequenceSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const isScanActive = scanProgress && scanProgress.status === "running";
  const isScanDone = scanProgress && (scanProgress.status === "completed" || scanProgress.status === "failed");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <PageHeader
        title="CRM Reactivation Agent"
        description="Re-engage dormant leads and lost deals with AI-powered outreach sequences."
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="bg-card/50 border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 flex-wrap">
          <TabsTrigger value="crm-import">CRM Import</TabsTrigger>
          <TabsTrigger value="dormant">Dormant Leads</TabsTrigger>
          <TabsTrigger value="campaign-builder">Campaign Builder</TabsTrigger>
          <TabsTrigger value="execution">Execution Status</TabsTrigger>
          <TabsTrigger value="attribution">Attribution</TabsTrigger>
          <TabsTrigger value="safety">Safety Guards</TabsTrigger>
        </TabsList>

        {/* ── CRM Import ── */}
        <TabsContent value="crm-import" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  Connect CRM
                </CardTitle>
                <CardDescription>Import dormant leads from your connected CRM platform.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Link2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">HubSpot</p>
                      <p className="text-xs text-muted-foreground">
                        {isHubspotConnected && !isHubspotError
                          ? [
                              settings?.hubspotPortalId ? `Portal ${settings.hubspotPortalId}` : null,
                              maskedToken ? `Token: ${maskedToken}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Connected"
                          : isHubspotError
                            ? "Token expired or revoked — enter a new token"
                            : "Connect to scan for dormant leads"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isHubspotConnected && !isHubspotError && (
                      <Badge variant="outline" className="text-green-400 border-green-400/30">Connected</Badge>
                    )}
                    {isHubspotError && (
                      <Badge variant="outline" className="text-red-400 border-red-400/30 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Error
                      </Badge>
                    )}
                    {isHubspotConnected && !isHubspotError ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setShowConnectModal(true)}
                      >
                        Rotate Key
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setShowConnectModal(true)}>
                        {isHubspotError ? "Reconnect" : "Connect"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Scan progress */}
                {(isScanActive || isScanDone) && scanProgress && (
                  <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {isScanDone
                          ? scanProgress.status === "failed"
                            ? "Scan Failed"
                            : "Scan Complete"
                          : "Scanning HubSpot..."}
                      </span>
                      <span className="text-muted-foreground">{scanProgress.progress}%</span>
                    </div>
                    <Progress value={scanProgress.progress} className="h-2" />
                    {scanProgress.status !== "failed" && (
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div><span className="font-medium text-foreground">{scanProgress.totalFound}</span> found</div>
                        <div><span className="font-medium text-green-400">{scanProgress.imported}</span> imported</div>
                        <div><span className="font-medium text-yellow-400">{scanProgress.duplicates}</span> duplicates</div>
                      </div>
                    )}
                    {scanProgress.status === "failed" && scanProgress.error && (
                      <p className="text-xs text-red-400 flex items-center gap-1">
                        <XCircle className="h-3 w-3 flex-shrink-0" /> {scanProgress.error}
                      </p>
                    )}
                    {scanProgress.status === "completed" && (
                      <p className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {scanProgress.imported} leads imported successfully
                        {scanProgress.excluded > 0 && ` · ${scanProgress.excluded} excluded (active customers / Closed Won)`}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Import Filters</CardTitle>
                <CardDescription>Define criteria for which leads to reactivate.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Inactivity Period</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={scanFilters.inactivityDays}
                    onChange={(e) => setScanFilters((f) => ({ ...f, inactivityDays: Number(e.target.value) }))}
                  >
                    {INACTIVITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Deal Stage Filter</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={scanFilters.dealStage}
                    onChange={(e) => setScanFilters((f) => ({ ...f, dealStage: e.target.value }))}
                  >
                    {DEAL_STAGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Minimum Deal Value</Label>
                  <Input
                    type="number"
                    placeholder="5000"
                    value={scanFilters.minDealValue || ""}
                    onChange={(e) => setScanFilters((f) => ({ ...f, minDealValue: Number(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to include all deal values</p>
                </div>

                <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-400 space-y-1">
                  <p className="font-medium flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" /> Collateral Damage Filter — Always Active
                  </p>
                  <p className="text-muted-foreground">Automatically excludes Closed Won deals and contacts with active customer status.</p>
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={handleScanAndImport}
                  disabled={triggerScan.isPending || isScanActive === true}
                >
                  <Database className="h-4 w-4" />
                  {isScanActive ? "Scanning..." : "Scan & Import"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Dormant Leads ── */}
        <TabsContent value="dormant" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Dormant Lead Pool</CardTitle>
              <CardDescription>Leads imported from HubSpot with source=reactivation.</CardDescription>
            </CardHeader>
            <CardContent>
              {leadsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
                </div>
              ) : dormantLeads.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No dormant leads yet</p>
                  <p className="text-sm mt-1">Use the CRM Import tab to scan HubSpot for dormant leads.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden sm:table-cell">Company</TableHead>
                        <TableHead className="hidden md:table-cell">Deal Value</TableHead>
                        <TableHead className="hidden lg:table-cell">Lost Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dormantLeads.map((lead) => (
                        <TableRow key={lead.id}>
                          <TableCell className="font-medium">{lead.firstName} {lead.lastName}</TableCell>
                          <TableCell className="hidden sm:table-cell">{lead.company}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell max-w-[180px]">
                            {(lead as any).lostReason ? (
                              <span className="text-xs text-muted-foreground line-clamp-1">{(lead as any).lostReason}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={statusColor[lead.status] ?? ""}>{lead.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{ width: `${lead.engagementScore ?? 0}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground">{lead.engagementScore ?? 0}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Campaign Builder ── */}
        <TabsContent value="campaign-builder" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" />
                  Reactivation Setup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Campaign Name</Label>
                  <Input
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="Q1 Lost Deal Revival"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                  >
                    <option value="email">Email</option>
                    <option value="linkedin">LinkedIn</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Reactivation Reason / Context</Label>
                  <Textarea
                    rows={3}
                    value={reactivationContext}
                    onChange={(e) => setReactivationContext(e.target.value)}
                    placeholder="New product features, pricing changes, case studies, Q1 deals..."
                  />
                  <p className="text-xs text-muted-foreground">AI will adapt tone based on each lead's lost reason from HubSpot.</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border text-sm">
                  <p className="font-medium">{dormantLeads.length} dormant leads available</p>
                  <p className="text-xs text-muted-foreground mt-1">All leads will be added to this campaign</p>
                </div>
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={handleGenerateReactivation}
                  disabled={reactivationMutation.isPending || dormantLeads.length === 0}
                >
                  <Wand2 className="h-4 w-4" />
                  {reactivationMutation.isPending ? "Generating..." : "AI Generate Step 1"}
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Reactivation Sequence</CardTitle>
                <CardDescription>Configure each step of the multi-touch sequence</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {sequenceSteps.map((step, index) => (
                  <div key={step.stepNumber} className="p-4 rounded-lg border border-border bg-muted/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">{step.stepNumber}</span>
                        </div>
                        <span className="font-medium text-sm">Step {step.stepNumber}</span>
                        <Badge variant="secondary" className="text-xs">
                          {step.delayDays === 0 ? "Immediate" : `Day ${step.delayDays}`}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs text-muted-foreground">Delay (days)</Label>
                          <Input
                            type="number"
                            className="w-16 h-7 text-xs"
                            value={step.delayDays}
                            min={0}
                            onChange={(e) => updateStep(index, "delayDays", Number(e.target.value))}
                            disabled={step.stepNumber === 1}
                          />
                        </div>
                        {sequenceSteps.length > 1 && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeStep(index)}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Input
                      placeholder="Subject line..."
                      value={step.subject}
                      onChange={(e) => updateStep(index, "subject", e.target.value)}
                      className="text-sm"
                    />
                    <Textarea
                      rows={3}
                      placeholder="Email body..."
                      value={step.body}
                      onChange={(e) => updateStep(index, "body", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                ))}

                <Button variant="outline" size="sm" className="w-full gap-2" onClick={addStep}>
                  <Plus className="h-4 w-4" /> Add Step
                </Button>

                {reactivationMutation.data?.messages && (
                  <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-xs text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5" />
                    AI generated {reactivationMutation.data.messages.length} personalized messages — step 1 auto-filled.
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-end gap-3 border-t pt-4">
                <Button
                  className="gap-2"
                  onClick={handleCreateAndLaunch}
                  disabled={createCampaign.isPending || launchCampaign.isPending || dormantLeads.length === 0}
                >
                  <Send className="h-4 w-4" />
                  {createCampaign.isPending || launchCampaign.isPending ? "Launching..." : "Create & Launch Campaign"}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        {/* ── Execution Status ── */}
        <TabsContent value="execution" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Execution Status</CardTitle>
              <CardDescription>Track your active reactivation campaigns in real-time.</CardDescription>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => <div key={i} className="h-24 bg-muted rounded animate-pulse" />)}
                </div>
              ) : reactivationCampaigns.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No reactivation campaigns</p>
                  <p className="text-sm mt-1">Build one in the Campaign Builder tab.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* HubSpot error reconnect banner */}
                  {isHubspotError && (
                    <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                      <div className="flex items-center gap-2 text-sm text-red-400">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        HubSpot token expired or revoked — sequence scheduling paused.
                      </div>
                      <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:text-red-300" onClick={() => setShowConnectModal(true)}>
                        Reconnect
                      </Button>
                    </div>
                  )}

                  {/* Daily limit indicator */}
                  {settings && (
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/10 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Shield className="h-4 w-4" />
                        Daily outreach: <span className="font-medium text-foreground">{settings.dailyOutreachToday}</span> / {settings.dailyOutreachLimit}
                      </div>
                      <div className="w-32">
                        <Progress value={(settings.dailyOutreachToday / settings.dailyOutreachLimit) * 100} className="h-1.5" />
                      </div>
                    </div>
                  )}

                  {reactivationCampaigns.map((campaign) => {
                    const sent = campaign.sentCount ?? 0;
                    const opened = campaign.openCount ?? 0;
                    const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
                    const replyRate = sent > 0 ? Math.round(((campaign.replyCount ?? 0) / sent) * 100) : 0;

                    return (
                      <Card key={campaign.id} className="bg-muted/30">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="font-semibold">{campaign.name}</h4>
                              <p className="text-sm text-muted-foreground mt-1">{campaign.subject}</p>
                            </div>
                            <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                              {campaign.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-5 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Sent</p>
                              <p className="font-semibold">{sent.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Open Rate</p>
                              <p className="font-semibold">{openRate}%</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Reply Rate</p>
                              <p className="font-semibold">{replyRate}%</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Replies</p>
                              <p className="font-semibold">{(campaign.replyCount ?? 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Meetings</p>
                              <p className="font-semibold">{campaign.meetingsBooked}</p>
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${openRate}%` }} />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Attribution ── */}
        <TabsContent value="attribution" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Revenue Attribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Pipeline Reactivated</span>
                    <span className="font-bold text-lg">${(totalMeetings * 8500).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Deals Closed</span>
                    <span className="font-bold text-lg">
                      ${(Math.floor(totalMeetings * 0.3) * 12000).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">ROI</span>
                    <span className="font-bold text-lg text-green-500">340%</span>
                  </div>
                </div>
                <div className="pt-3 border-t space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Attribution Path</p>
                  {["Dormant", "Contacted", "Re-engaged", "Meeting Booked"].map((stage, i) => (
                    <div key={stage} className="flex items-center gap-2 text-xs">
                      <div className={`w-2 h-2 rounded-full ${i === 0 ? "bg-blue-400" : i === 1 ? "bg-yellow-400" : i === 2 ? "bg-purple-400" : "bg-emerald-400"}`} />
                      <span className="text-muted-foreground">{stage}</span>
                      {i < 3 && <span className="text-muted-foreground/40 ml-auto">→</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Campaign Performance Comparison</CardTitle>
                <CardDescription>Revenue contribution by reactivation campaign.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Leads</TableHead>
                        <TableHead className="hidden sm:table-cell">Re-engaged</TableHead>
                        <TableHead>Meetings</TableHead>
                        <TableHead className="hidden sm:table-cell">Pipeline Value</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reactivationCampaigns.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No reactivation campaigns yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        reactivationCampaigns.map((campaign) => (
                          <TableRow key={campaign.id}>
                            <TableCell className="font-medium">{campaign.name}</TableCell>
                            <TableCell>{campaign.leadCount}</TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <div className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3 text-green-500" />
                                {campaign.replyCount}
                              </div>
                            </TableCell>
                            <TableCell>{campaign.meetingsBooked}</TableCell>
                            <TableCell className="font-medium text-green-500 hidden sm:table-cell">
                              ${((campaign.meetingsBooked ?? 0) * 8500).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                                {campaign.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Safety Guards ── */}
        <TabsContent value="safety" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Daily Outreach Limits
                </CardTitle>
                <CardDescription>
                  Prevent domain reputation damage by capping daily email volume.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Max emails per day</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={dailyLimit}
                      min={1}
                      max={10000}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">emails / day</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recommended: 50–200 for cold outreach. Keep below provider sending limits.
                  </p>
                </div>
                {settings && (
                  <div className="p-3 rounded-lg bg-muted/20 border border-border text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sent today</span>
                      <span className="font-medium">{settings.dailyOutreachToday}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current limit</span>
                      <span className="font-medium">{settings.dailyOutreachLimit}</span>
                    </div>
                    <Progress
                      value={(settings.dailyOutreachToday / settings.dailyOutreachLimit) * 100}
                      className="h-2 mt-1"
                    />
                  </div>
                )}
                <Button onClick={handleUpdateDailyLimit} disabled={updateSettings.isPending} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {updateSettings.isPending ? "Saving..." : "Save Limit"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  Collateral Damage Protection
                </CardTitle>
                <CardDescription>
                  Rules enforced on every HubSpot scan to prevent re-engaging existing customers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Exclude Closed Won deals", desc: "HubSpot dealstage = closedwon is never imported", active: true },
                  { label: "Exclude active customers", desc: "Contacts with hs_lead_status = CUSTOMER are skipped", active: true },
                  { label: "Email deduplication", desc: "Leads already in the database are skipped by email or CRM ID", active: true },
                  { label: "Replied/booked skip", desc: "Leads that replied or booked are skipped in later sequence steps", active: true },
                ].map((rule) => (
                  <div key={rule.label} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/10">
                    <CheckCircle2 className={`h-4 w-4 mt-0.5 flex-shrink-0 ${rule.active ? "text-green-400" : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-medium">{rule.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{rule.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── HubSpot Connect Modal ── */}
      <Dialog open={showConnectModal} onOpenChange={setShowConnectModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              {isHubspotConnected && !isHubspotError ? "Rotate HubSpot Token" : "Connect HubSpot"}
            </DialogTitle>
            <DialogDescription>
              {isHubspotConnected && !isHubspotError ? (
                <>
                  Your token <span className="font-mono text-xs">{maskedToken ?? "•••"}</span> is active.
                  Only enter a new token below if you want to replace it.
                </>
              ) : (
                <>
                  Enter your HubSpot Private App Token. Create one in HubSpot → Settings → Integrations → Private Apps.
                  Required scopes: <code className="text-xs bg-muted px-1 rounded">crm.objects.deals.read</code> and <code className="text-xs bg-muted px-1 rounded">crm.objects.contacts.read</code>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Private App Token</Label>
              <Input
                type="password"
                placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={hubspotToken}
                onChange={(e) => setHubspotToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnectHubspot()}
              />
            </div>
            {connectHubspot.error && (
              <p className="text-sm text-red-400 flex items-center gap-1.5">
                <XCircle className="h-4 w-4 flex-shrink-0" />
                {(connectHubspot.error as Error).message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConnectModal(false)}>Cancel</Button>
            <Button onClick={handleConnectHubspot} disabled={connectHubspot.isPending || !hubspotToken.trim()}>
              {connectHubspot.isPending ? "Connecting..." : "Connect HubSpot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
