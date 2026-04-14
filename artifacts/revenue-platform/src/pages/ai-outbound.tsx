import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/molecules/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Upload, Wand2, Plus, ArrowRight, CheckCircle2, ShieldCheck,
  AlertTriangle, ListOrdered, Clock, Send, Trash2, Loader2,
  LayoutList, Play, Pause, BarChart3, Mail,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOutboundJob } from "@workspace/api-client-react";
import { useImportLeads, useLeads, useVerifyLeads } from "@/hooks/use-leads";
import { useAIPersonalize, useAIGenerateSequence } from "@/hooks/use-ai";
import { useEmailAccounts, useCreateEmailAccount, useDeleteEmailAccount } from "@/hooks/use-email-accounts";
import { useCampaigns, useCreateCampaign, useLaunchCampaign, usePauseCampaign } from "@/hooks/use-campaigns";
import { CampaignPipelinePanel } from "@/components/molecules/campaign-pipeline-panel";
import { CampaignAnalyticsPanel, type CampaignAnalyticsData } from "@/components/molecules/campaign-analytics-panel";
import { useToast } from "@/hooks/use-toast";

// ── Status badge helper ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  if (s === "active")
    return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-600">Active</span>;
  if (s === "warming_up" || s === "warming up")
    return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-500/10 text-yellow-600">Warming Up</span>;
  if (s === "paused")
    return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-600">Paused</span>;
  return <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground capitalize">{status}</span>;
}

// ── Campaign status badge ──────────────────────────────────────────────────────

function CampaignStatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  if (s === "active")     return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>;
  if (s === "paused")     return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Paused</Badge>;
  if (s === "completed")  return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Completed</Badge>;
  if (s === "failed")     return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Failed</Badge>;
  return <Badge variant="secondary" className="capitalize">{status}</Badge>;
}

// ── CSV parser ─────────────────────────────────────────────────────────────────

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { rows: [], error: "CSV must have a header row and at least one data row." };

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const required = ["firstname", "lastname", "email", "company", "title"];
  const missing  = required.filter((r) => !headers.includes(r));
  if (missing.length > 0)
    return { rows: [], error: `Missing required columns: ${missing.join(", ")}. Expected: firstName, lastName, email, company, title` };

  const rows = lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return {
      firstName: obj["firstname"],
      lastName:  obj["lastname"],
      email:     obj["email"],
      company:   obj["company"],
      title:     obj["title"],
    };
  }).filter((r) => r.email);

  return { rows, error: null };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AIOutbound() {
  const { toast } = useToast();

  // ── Server state ──────────────────────────────────────────────────────────
  const importMutation      = useImportLeads();
  const personalizeMutation = useAIPersonalize();
  const verifyMutation      = useVerifyLeads();
  const sequenceMutation    = useAIGenerateSequence();
  const createCampaignMut   = useCreateCampaign();
  const launchCampaignMut   = useLaunchCampaign();
  const pauseCampaignMut    = usePauseCampaign();
  const createMailboxMut    = useCreateEmailAccount();
  const deleteMailboxMut    = useDeleteEmailAccount();

  const { data: leads }         = useLeads();
  const { data: emailAccounts } = useEmailAccounts();
  const { data: campaigns }     = useCampaigns();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab,       setActiveTab]       = useState("sourcing");

  // Tab 1 — Lead Sourcing
  const [apolloUrl,       setApolloUrl]       = useState("");
  const [csvError,        setCsvError]        = useState<string | null>(null);
  const [importJobId,     setImportJobId]     = useState<number | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Tab 3 — Mailboxes
  const [mailboxOpen,     setMailboxOpen]     = useState(false);
  const [mbEmail,         setMbEmail]         = useState("");
  const [mbProvider,      setMbProvider]      = useState("Google Workspace");
  const [mbLimit,         setMbLimit]         = useState("40");

  // Tab 4 — Personalization
  const [promptContext,   setPromptContext]   = useState("We are selling a B2B SaaS platform for revenue teams.");
  const [selectedLeadId,  setSelectedLeadId]  = useState<number | null>(null);
  const [tone,            setTone]            = useState("professional");

  // Tab 5 — Campaign Builder
  const [campaignName,    setCampaignName]    = useState("");
  const [sequenceCount,   setSequenceCount]   = useState("4");
  const [targetAudience,  setTargetAudience]  = useState("B2B SaaS decision makers (VP/C-level)");
  const [pipelineOpen,    setPipelineOpen]    = useState(false);
  const [launchedId,      setLaunchedId]      = useState<number | null>(null);
  const [launchedName,    setLaunchedName]    = useState("");

  // Tab 6 — Active Campaigns
  const [analyticsOpen,   setAnalyticsOpen]   = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignAnalyticsData | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const unverifiedLeads = leads?.filter((l) => !l.verified) ?? [];
  const verifiedLeads   = leads?.filter((l) => l.verified)  ?? [];
  const previewLead     = selectedLeadId != null
    ? leads?.find((l) => l.id === selectedLeadId)
    : null;

  // ── Job polling (import progress) ─────────────────────────────────────────
  const { data: importJob } = useQuery({
    queryKey: ["outbound-job", importJobId],
    queryFn:  () => getOutboundJob(importJobId!, { credentials: "include" }),
    enabled:  !!importJobId,
    refetchInterval: (data) =>
      data?.status === "completed" || data?.status === "failed" ? false : 3000,
  });

  const importJobDone = importJob?.status === "completed" || importJob?.status === "failed";

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleApolloImport = () => {
    importMutation.mutate(
      { source: "apollo", filters: { searchUrl: apolloUrl } as any },
      {
        onSuccess: (data) => {
          toast({ title: "Leads Imported", description: `${data.imported} leads imported from Apollo.` });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Import Failed", description: err?.message ?? "Could not import from Apollo." });
        },
      },
    );
  };

  const handleCsvSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, error } = parseCsv(text);
      if (error) { setCsvError(error); return; }

      importMutation.mutate(
        { source: "csv", leads: rows } as any,
        {
          onSuccess: (data) => {
            toast({ title: "CSV Imported", description: `${data.imported} leads imported (${data.duplicates} duplicates skipped).` });
          },
          onError: (err: any) => {
            toast({ variant: "destructive", title: "Import Failed", description: err?.message ?? "Could not import CSV." });
          },
        },
      );
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleVerifyAll = () => {
    const ids = unverifiedLeads.map((l) => l.id);
    if (ids.length === 0) return;
    verifyMutation.mutate(
      { leadIds: ids },
      {
        onSuccess: (data) => {
          toast({ title: "Verification Complete", description: `${data.verified} verified, ${data.invalid} invalid out of ${data.total} emails.` });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Verification Failed", description: err?.message ?? "Could not verify emails." });
        },
      },
    );
  };

  const handleAddMailbox = () => {
    if (!mbEmail) return;
    createMailboxMut.mutate(
      { email: mbEmail, provider: mbProvider, dailyLimit: parseInt(mbLimit) || 40 },
      {
        onSuccess: () => {
          toast({ title: "Mailbox Added", description: `${mbEmail} connected successfully.` });
          setMailboxOpen(false);
          setMbEmail("");
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Failed to Add Mailbox", description: err?.message ?? "Could not connect mailbox." });
        },
      },
    );
  };

  const handleDeleteMailbox = (id: number, email: string) => {
    deleteMailboxMut.mutate(id, {
      onSuccess: () => toast({ title: "Mailbox Removed", description: `${email} disconnected.` }),
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Delete Failed", description: err?.message ?? "Could not remove mailbox." });
      },
    });
  };

  const handleGenerate = () => {
    if (!selectedLeadId) {
      toast({ variant: "destructive", title: "Select a Lead", description: "Choose a lead to personalise the email for." });
      return;
    }
    personalizeMutation.mutate(
      { leadId: selectedLeadId, templateType: "cold_outreach", context: promptContext, tone } as any,
      {
        onSuccess: () => {
          toast({ title: "AI Personalization Generated", description: "Subject lines and email copy have been drafted." });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Generation Failed", description: err?.message ?? "AI could not generate email." });
        },
      },
    );
  };

  const handleGenerateSequence = () => {
    sequenceMutation.mutate(
      {
        campaignType: "outbound",
        numberOfEmails: parseInt(sequenceCount),
        targetAudience,
        tone: "professional",
        campaignName: campaignName || undefined,
      } as any,
      {
        onSuccess: () => {
          toast({ title: "Sequence Generated", description: `${sequenceCount}-email sequence created by AI.` });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Sequence Failed", description: err?.message ?? "AI could not generate sequence." });
        },
      },
    );
  };

  const handleLaunchCampaign = () => {
    if (!campaignName.trim()) {
      toast({ variant: "destructive", title: "Campaign Name Required", description: "Please enter a name before launching." });
      return;
    }
    if (!sequenceMutation.data?.emails?.length) {
      toast({ variant: "destructive", title: "Generate Sequence First", description: "Use 'AI Generate Sequence' before launching." });
      return;
    }

    createCampaignMut.mutate(
      {
        name: campaignName,
        type: "outbound",
        leadIds: verifiedLeads.map((l) => l.id),
        emailSequence: sequenceMutation.data.emails.map((e) => JSON.stringify(e)),
      } as any,
      {
        onSuccess: (campaign) => {
          setLaunchedId(campaign.id);
          setLaunchedName(campaign.name);
          launchCampaignMut.mutate(campaign.id, {
            onSuccess: () => {
              setPipelineOpen(true);
              toast({ title: "Campaign Launched", description: `${campaign.name} is now running.` });
            },
            onError: (err: any) => {
              toast({ variant: "destructive", title: "Launch Failed", description: err?.message ?? "Campaign created but could not start." });
            },
          });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Campaign Creation Failed", description: err?.message ?? "Could not create campaign." });
        },
      },
    );
  };

  const handlePauseCampaign = (id: number) => {
    pauseCampaignMut.mutate(id, {
      onSuccess: () => toast({ title: "Campaign Paused" }),
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Pause Failed", description: err?.message });
      },
    });
  };

  const handleResumeCampaign = (id: number) => {
    launchCampaignMut.mutate(id, {
      onSuccess: () => toast({ title: "Campaign Resumed" }),
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Resume Failed", description: err?.message });
      },
    });
  };

  const isLaunching = createCampaignMut.isPending || launchCampaignMut.isPending;
  const canLaunch   = !!campaignName.trim() && !!sequenceMutation.data?.emails?.length && verifiedLeads.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <PageHeader
          title="AI Outbound Agent"
          description="Automate lead sourcing, verification, and hyper-personalized outreach."
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 p-1 border border-border/50 rounded-xl h-auto flex-wrap">
            <TabsTrigger value="sourcing"          className="py-2.5 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">1. Lead Sourcing</TabsTrigger>
            <TabsTrigger value="verification"      className="py-2.5 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">2. Verification</TabsTrigger>
            <TabsTrigger value="mailboxes"         className="py-2.5 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">3. Mailboxes</TabsTrigger>
            <TabsTrigger value="personalization"   className="py-2.5 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">4. AI Personalization</TabsTrigger>
            <TabsTrigger value="campaign-builder"  className="py-2.5 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">5. Campaign Builder</TabsTrigger>
            <TabsTrigger value="campaigns"         className="py-2.5 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-1.5">
              <LayoutList className="w-3.5 h-3.5" />6. Active Campaigns
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Lead Sourcing ─────────────────────────────────────── */}
          <TabsContent value="sourcing" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Apollo */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle>Apollo Integration</CardTitle>
                  <CardDescription>Pull leads directly from saved searches</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Saved Search URL</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://app.apollo.io/#/people..."
                        className="bg-background"
                        value={apolloUrl}
                        onChange={(e) => setApolloUrl(e.target.value)}
                      />
                      <Button
                        onClick={handleApolloImport}
                        disabled={importMutation.isPending || !apolloUrl.trim()}
                      >
                        {importMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Importing…</> : "Import"}
                      </Button>
                    </div>
                  </div>

                  {/* Job status */}
                  {importJob && !importJobDone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/30 border border-border">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span>Importing leads… ({importJob.stage})</span>
                    </div>
                  )}
                  {importJob?.status === "completed" && (
                    <div className="flex items-center gap-2 text-sm text-green-600 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Import complete — {(importJob.result as any)?.imported ?? 0} leads added.</span>
                    </div>
                  )}
                  {importJob?.status === "failed" && (
                    <div className="flex items-center gap-2 text-sm text-red-600 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Import failed: {importJob.error ?? "Unknown error"}</span>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-muted/30 p-4 mt-2">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <span>Auto-verification enabled via MillionVerifier</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <span>Scraping LinkedIn data for personalization</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* CSV Upload */}
              <Card className="border-border/50 shadow-sm border-dashed bg-muted/10">
                <CardContent className="flex flex-col items-center justify-center h-full p-10 text-center space-y-4">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Upload CSV</h3>
                    <p className="text-sm text-muted-foreground mt-1">Drag and drop your lead list here, or click to browse.</p>
                    <p className="text-xs text-muted-foreground/70 mt-2 font-mono">Required columns: firstName, lastName, email, company, title</p>
                  </div>

                  {csvError && (
                    <div className="w-full text-left p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <p className="text-xs text-red-600">{csvError}</p>
                    </div>
                  )}
                  {importMutation.isPending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Processing CSV…
                    </div>
                  )}

                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleCsvSelect}
                  />
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={() => csvInputRef.current?.click()}
                    disabled={importMutation.isPending}
                  >
                    Browse Files
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 2: Verification ──────────────────────────────────────── */}
          <TabsContent value="verification" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                    Verification Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Verified</span>
                    </div>
                    <span className="font-bold text-green-500">{verifiedLeads.length}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/10">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Unverified</span>
                    </div>
                    <span className="font-bold text-yellow-500">{unverifiedLeads.length}</span>
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={handleVerifyAll}
                    disabled={verifyMutation.isPending || unverifiedLeads.length === 0}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {verifyMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</> : "Verify All Pending"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">Powered by MillionVerifier API</p>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle>Email Verification Results</CardTitle>
                  <CardDescription>
                    {leads?.length ?? 0} leads total — review verification status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!leads?.length ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      No leads yet. Import leads from the Lead Sourcing tab.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="hidden sm:table-cell">Company</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leads.map((lead) => (
                            <TableRow key={lead.id}>
                              <TableCell className="font-mono text-sm">{lead.email}</TableCell>
                              <TableCell>{lead.firstName} {lead.lastName}</TableCell>
                              <TableCell className="text-muted-foreground hidden sm:table-cell">{lead.company}</TableCell>
                              <TableCell>
                                {lead.verified ? (
                                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Valid
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                                    <AlertTriangle className="h-3 w-3 mr-1" /> Unverified
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 3: Mailboxes ─────────────────────────────────────────── */}
          <TabsContent value="mailboxes" className="mt-0">
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Sending Infrastructure</CardTitle>
                  <CardDescription>Manage connected inboxes and daily limits</CardDescription>
                </div>
                <Button size="sm" className="gap-2" onClick={() => setMailboxOpen(true)}>
                  <Plus className="w-4 h-4" /> Add Mailbox
                </Button>
              </CardHeader>
              <CardContent>
                {!emailAccounts?.length ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    No mailboxes connected yet. Add a mailbox to start sending.
                  </div>
                ) : (
                  <div className="rounded-xl border border-border overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[600px]">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Account</th>
                          <th className="px-4 py-3 font-medium">Provider</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Sent Today</th>
                          <th className="px-4 py-3 font-medium">Daily Limit</th>
                          <th className="px-4 py-3 font-medium w-12" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {emailAccounts.map((acct) => (
                          <tr key={acct.id} className="bg-background hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium">{acct.email}</td>
                            <td className="px-4 py-3 text-muted-foreground">{acct.provider}</td>
                            <td className="px-4 py-3"><StatusBadge status={acct.status} /></td>
                            <td className="px-4 py-3">{acct.sentToday}</td>
                            <td className="px-4 py-3">{acct.dailyLimit}</td>
                            <td className="px-4 py-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-red-500"
                                onClick={() => handleDeleteMailbox(acct.id, acct.email)}
                                disabled={deleteMailboxMut.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add Mailbox Dialog */}
            <Dialog open={mailboxOpen} onOpenChange={setMailboxOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Connect Mailbox</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      placeholder="you@yourdomain.com"
                      value={mbEmail}
                      onChange={(e) => setMbEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select value={mbProvider} onValueChange={setMbProvider}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Google Workspace">Google Workspace</SelectItem>
                        <SelectItem value="Microsoft 365">Microsoft 365</SelectItem>
                        <SelectItem value="SMTP">SMTP / Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Daily Send Limit</Label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={mbLimit}
                      onChange={(e) => setMbLimit(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setMailboxOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleAddMailbox}
                    disabled={createMailboxMut.isPending || !mbEmail.trim()}
                  >
                    {createMailboxMut.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Connecting…</> : "Add Mailbox"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ── Tab 4: AI Personalization ────────────────────────────────── */}
          <TabsContent value="personalization" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1 border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle>AI Prompt Context</CardTitle>
                  <CardDescription>Train the agent on your offer</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Lead</Label>
                    <Select
                      value={selectedLeadId != null ? String(selectedLeadId) : ""}
                      onValueChange={(v) => setSelectedLeadId(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a lead to preview…" />
                      </SelectTrigger>
                      <SelectContent>
                        {!leads?.length && (
                          <SelectItem value="" disabled>No leads available — import first</SelectItem>
                        )}
                        {leads?.map((l) => (
                          <SelectItem key={l.id} value={String(l.id)}>
                            {l.firstName} {l.lastName} — {l.company}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Value Proposition</Label>
                    <Textarea
                      rows={5}
                      className="resize-none"
                      value={promptContext}
                      onChange={(e) => setPromptContext(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional &amp; Direct</SelectItem>
                        <SelectItem value="casual">Casual &amp; Friendly</SelectItem>
                        <SelectItem value="challenger">Challenger Sale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    className="w-full gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                    onClick={handleGenerate}
                    disabled={personalizeMutation.isPending || !selectedLeadId}
                  >
                    <Wand2 className="w-4 h-4" />
                    {personalizeMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</> : "Generate Sample"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle>
                    Preview output for:{" "}
                    <span className="text-primary">
                      {previewLead
                        ? `${previewLead.firstName} ${previewLead.lastName} (${previewLead.title} at ${previewLead.company})`
                        : "— select a lead —"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-muted/30 rounded-xl p-6 border border-border min-h-[180px]">
                    {personalizeMutation.data ? (
                      <>
                        <div className="text-sm font-medium text-muted-foreground mb-4 border-b border-border/50 pb-4">
                          <p><span className="text-foreground">Subject:</span> {personalizeMutation.data.subjectLine}</p>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground whitespace-pre-wrap">
                          {personalizeMutation.data.body}
                        </div>
                      </>
                    ) : (
                      <div className="text-center text-muted-foreground p-4 text-sm">
                        {!selectedLeadId
                          ? "Select a lead above, then click Generate Sample."
                          : "Click Generate Sample to draft personalised copy."}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={handleGenerate} disabled={personalizeMutation.isPending || !selectedLeadId}>
                      Regenerate
                    </Button>
                    <Button className="gap-2" onClick={() => setActiveTab("campaign-builder")}>
                      Create Campaign <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 5: Campaign Builder ──────────────────────────────────── */}
          <TabsContent value="campaign-builder" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1 border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListOrdered className="h-5 w-5 text-primary" />
                    Campaign Setup
                  </CardTitle>
                  <CardDescription>Configure your outbound campaign</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Campaign Name</Label>
                    <Input
                      placeholder="Q1 Enterprise Outbound"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Audience</Label>
                    <Textarea
                      rows={3}
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Emails in Sequence</Label>
                    <select
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={sequenceCount}
                      onChange={(e) => setSequenceCount(e.target.value)}
                    >
                      <option value="3">3 emails</option>
                      <option value="4">4 emails</option>
                      <option value="5">5 emails</option>
                      <option value="6">6 emails</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Lead Pool</Label>
                    <div className={`p-3 rounded-lg border text-sm ${verifiedLeads.length > 0 ? "bg-green-500/5 border-green-500/20" : "bg-muted/30 border-border"}`}>
                      <p className="font-medium">
                        {verifiedLeads.length > 0
                          ? `${verifiedLeads.length} verified leads selected`
                          : "No verified leads — go to Verification tab"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Only verified emails will be included</p>
                    </div>
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={handleGenerateSequence}
                    disabled={sequenceMutation.isPending}
                  >
                    <Wand2 className="h-4 w-4" />
                    {sequenceMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : "AI Generate Sequence"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle>Email Sequence Preview</CardTitle>
                  <CardDescription>AI-generated multi-step outreach sequence</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {sequenceMutation.data?.emails?.length ? (
                      sequenceMutation.data.emails.map((email) => (
                        <div key={email.order} className="p-4 rounded-lg border border-border bg-muted/20">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-sm font-bold text-primary">{email.order}</span>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{email.subject}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{email.delay}</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground ml-11 whitespace-pre-wrap">{email.body}</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center p-8 text-muted-foreground text-sm">
                        No sequence generated yet. Configure options and click "AI Generate Sequence".
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-3 border-t pt-4">
                  <Button variant="outline" onClick={handleGenerateSequence} disabled={sequenceMutation.isPending}>
                    Regenerate
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          className="gap-2"
                          onClick={handleLaunchCampaign}
                          disabled={isLaunching || !canLaunch}
                        >
                          {isLaunching
                            ? <><Loader2 className="h-4 w-4 animate-spin" />Launching…</>
                            : <><Send className="h-4 w-4" /> Launch Campaign</>}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canLaunch && (
                      <TooltipContent>
                        {!campaignName.trim()
                          ? "Enter a campaign name"
                          : !sequenceMutation.data?.emails?.length
                          ? "Generate a sequence first"
                          : "No verified leads — verify leads first"}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab 6: Active Campaigns ──────────────────────────────────── */}
          <TabsContent value="campaigns" className="mt-0">
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutList className="h-5 w-5 text-primary" />
                  Active Campaigns
                </CardTitle>
                <CardDescription>
                  {campaigns?.length ?? 0} campaign{campaigns?.length !== 1 ? "s" : ""} — click a row for full analytics
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!campaigns?.length ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    No campaigns yet. Build and launch one from the Campaign Builder tab.
                  </div>
                ) : (
                  <div className="rounded-xl border border-border overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[680px]">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Campaign</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Type</th>
                          <th className="px-4 py-3 font-medium text-right">Sent</th>
                          <th className="px-4 py-3 font-medium text-right">Replies</th>
                          <th className="px-4 py-3 font-medium text-right">Meetings</th>
                          <th className="px-4 py-3 font-medium w-28" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {campaigns.map((c) => (
                          <tr
                            key={c.id}
                            className="bg-background hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => {
                              setSelectedCampaign({
                                id: c.id,
                                name: c.name,
                                status: c.status,
                                type: c.type,
                                sentCount:      (c as any).sentCount      ?? 0,
                                openCount:      (c as any).openCount      ?? 0,
                                replyCount:     (c as any).replyCount     ?? 0,
                                meetingsBooked: (c as any).meetingsBooked ?? 0,
                              });
                              setAnalyticsOpen(true);
                            }}
                          >
                            <td className="px-4 py-3 font-medium max-w-[200px] truncate">{c.name}</td>
                            <td className="px-4 py-3"><CampaignStatusBadge status={c.status} /></td>
                            <td className="px-4 py-3 capitalize text-muted-foreground">{c.type}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{((c as any).sentCount ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{((c as any).replyCount ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{((c as any).meetingsBooked ?? 0).toLocaleString()}</td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1 justify-end">
                                {c.status === "active" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs gap-1 text-amber-600 hover:text-amber-700"
                                    onClick={() => handlePauseCampaign(c.id)}
                                    disabled={pauseCampaignMut.isPending}
                                  >
                                    <Pause className="h-3 w-3" /> Pause
                                  </Button>
                                ) : c.status === "paused" || c.status === "draft" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs gap-1 text-green-600 hover:text-green-700"
                                    onClick={() => handleResumeCampaign(c.id)}
                                    disabled={launchCampaignMut.isPending}
                                  >
                                    <Play className="h-3 w-3" /> Launch
                                  </Button>
                                ) : null}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                                  onClick={() => {
                                    setSelectedCampaign({
                                      id: c.id,
                                      name: c.name,
                                      status: c.status,
                                      type: c.type,
                                      sentCount:      (c as any).sentCount      ?? 0,
                                      openCount:      (c as any).openCount      ?? 0,
                                      replyCount:     (c as any).replyCount     ?? 0,
                                      meetingsBooked: (c as any).meetingsBooked ?? 0,
                                    });
                                    setAnalyticsOpen(true);
                                  }}
                                >
                                  <BarChart3 className="h-3 w-3" /> Analytics
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Campaign Pipeline Sheet ──────────────────────────────────────── */}
        <CampaignPipelinePanel
          campaignId={launchedId}
          campaignName={launchedName}
          open={pipelineOpen}
          onClose={() => setPipelineOpen(false)}
        />

        {/* ── Campaign Analytics Sheet ─────────────────────────────────────── */}
        <CampaignAnalyticsPanel
          campaign={selectedCampaign}
          open={analyticsOpen}
          onClose={() => setAnalyticsOpen(false)}
        />
      </motion.div>
    </TooltipProvider>
  );
}
