import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/molecules/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Play,
  Pause,
  Search,
  MoreHorizontal,
  Megaphone,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  Mail,
  Sparkles,
  Plus,
  X,
  Activity,
} from "lucide-react";
import {
  listLeads,
  getListLeadsQueryKey,
  listPromptTemplates,
  getListPromptTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useCampaigns, useCreateCampaign, useLaunchCampaign, usePauseCampaign } from "@/hooks/use-campaigns";
import { useToast } from "@/hooks/use-toast";
import { CampaignPipelinePanel } from "@/components/molecules/campaign-pipeline-panel";
import { CampaignProgressInline } from "@/components/molecules/campaign-progress-inline";
import { CampaignAnalyticsPanel, type CampaignAnalyticsData } from "@/components/molecules/campaign-analytics-panel";
import { AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function resetForm(setters: {
  setFormName: (v: string) => void;
  setFormType: (v: string) => void;
  setFormSubject: (v: string) => void;
  setLeadsOpen: (v: boolean) => void;
  setLeadSearch: (v: string) => void;
  setSelectedLeadIds: (v: Set<number>) => void;
  setSeqOpen: (v: boolean) => void;
  setSeqSearch: (v: string) => void;
  setSelectedTemplateIds: (v: Set<number>) => void;
  setCustomSteps: (v: string[]) => void;
}) {
  setters.setFormName("");
  setters.setFormType("");
  setters.setFormSubject("");
  setters.setLeadsOpen(false);
  setters.setLeadSearch("");
  setters.setSelectedLeadIds(new Set());
  setters.setSeqOpen(false);
  setters.setSeqSearch("");
  setters.setSelectedTemplateIds(new Set());
  setters.setCustomSteps([]);
}

export default function Campaigns() {
  const { data: campaigns, isLoading } = useCampaigns();
  const createMutation = useCreateCampaign();
  const launchMutation = useLaunchCampaign();
  const pauseMutation = usePauseCampaign();
  const { toast } = useToast();

  // Pipeline progress — two independent states:
  // panelCampaignId  → which campaign the Sheet is open for (null = closed)
  // activePipelineIds → Set of campaign IDs whose inline bar is showing
  const [panelCampaignId,    setPanelCampaignId]    = useState<number | null>(null);
  const [panelCampaignName,  setPanelCampaignName]  = useState("");
  const [activePipelineIds,  setActivePipelineIds]  = useState<Set<number>>(new Set());

  const openPanel = (id: number, name: string) => {
    setPanelCampaignId(id);
    setPanelCampaignName(name);
  };
  const closePanel = () => setPanelCampaignId(null);
  const addInlineBar = (id: number) =>
    setActivePipelineIds((prev) => new Set(prev).add(id));
  const removeInlineBar = (id: number) =>
    setActivePipelineIds((prev) => { const next = new Set(prev); next.delete(id); return next; });

  // Analytics panel — independent state, does not affect pipeline or inline bar
  const [analyticsCampaign, setAnalyticsCampaign] = useState<CampaignAnalyticsData | null>(null);
  const openAnalytics = (c: CampaignAnalyticsData) => setAnalyticsCampaign(c);
  const closeAnalytics = () => setAnalyticsCampaign(null);

  // Campaign table search & pagination
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("");
  const [formSubject, setFormSubject] = useState("");

  // Leads section
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());

  // Email sequence section
  const [seqOpen, setSeqOpen] = useState(false);
  const [seqSearch, setSeqSearch] = useState("");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(new Set());
  const [customSteps, setCustomSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState("");

  // Fetch leads and templates only when the optional sections are opened
  const { data: allLeads = [] } = useQuery({
    queryKey: getListLeadsQueryKey(),
    queryFn: () => listLeads(undefined, { credentials: "include" }),
    enabled: leadsOpen,
  });

  const { data: templates = [] } = useQuery({
    queryKey: getListPromptTemplatesQueryKey(),
    queryFn: () => listPromptTemplates({ credentials: "include" }),
    enabled: seqOpen,
  });

  // Exclude completed leads — user confirmed they should be skipped
  const eligibleLeads = useMemo(
    () => allLeads.filter((l) => l.status !== "completed"),
    [allLeads]
  );

  const filteredLeads = useMemo(
    () =>
      eligibleLeads.filter(
        (l) =>
          l.firstName.toLowerCase().includes(leadSearch.toLowerCase()) ||
          l.lastName.toLowerCase().includes(leadSearch.toLowerCase()) ||
          l.company.toLowerCase().includes(leadSearch.toLowerCase()) ||
          l.email.toLowerCase().includes(leadSearch.toLowerCase())
      ),
    [eligibleLeads, leadSearch]
  );

  const filteredTemplates = useMemo(
    () =>
      templates.filter(
        (t) =>
          t.name.toLowerCase().includes(seqSearch.toLowerCase()) ||
          t.type.toLowerCase().includes(seqSearch.toLowerCase())
      ),
    [templates, seqSearch]
  );

  const allLeadsSelected =
    filteredLeads.length > 0 &&
    filteredLeads.every((l) => selectedLeadIds.has(l.id));

  const toggleLead = (id: number) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllLeads = () => {
    if (allLeadsSelected) {
      setSelectedLeadIds((prev) => {
        const next = new Set(prev);
        filteredLeads.forEach((l) => next.delete(l.id));
        return next;
      });
    } else {
      setSelectedLeadIds((prev) => {
        const next = new Set(prev);
        filteredLeads.forEach((l) => next.add(l.id));
        return next;
      });
    }
  };

  const toggleTemplate = (id: number) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addCustomStep = () => {
    const trimmed = newStep.trim();
    if (!trimmed) return;
    setCustomSteps((prev) => [...prev, trimmed]);
    setNewStep("");
  };

  const removeCustomStep = (idx: number) => {
    setCustomSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = () => {
    if (!formName.trim() || !formType) return;

    // Build emailSequence from selected templates + custom steps
    const selectedTemplateTexts = templates
      .filter((t) => selectedTemplateIds.has(t.id))
      .map((t) => t.template);
    const emailSequence =
      selectedTemplateTexts.length > 0 || customSteps.length > 0
        ? [...selectedTemplateTexts, ...customSteps]
        : undefined;

    const leadIds =
      selectedLeadIds.size > 0 ? Array.from(selectedLeadIds) : undefined;

    const nameSnapshot = formName.trim();

    createMutation.mutate(
      {
        name: nameSnapshot,
        type: formType,
        subject: formSubject.trim() || undefined,
        leadIds,
        emailSequence,
      },
      {
        onSuccess: (campaign) => {
          toast({
            title: "Campaign Created",
            description: `"${nameSnapshot}" was created. ${leadIds ? `${leadIds.length} lead(s) assigned.` : "AI agent will handle lead sourcing autonomously."}`,
          });
          setDialogOpen(false);
          resetForm({
            setFormName, setFormType, setFormSubject,
            setLeadsOpen, setLeadSearch, setSelectedLeadIds,
            setSeqOpen, setSeqSearch, setSelectedTemplateIds, setCustomSteps,
          });
          // Open pipeline progress panel for the newly created campaign
          // and show inline bar beneath the row
          openPanel(campaign.id, campaign.name);
          addInlineBar(campaign.id);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to create campaign.", variant: "destructive" });
        },
      }
    );
  };

  const handleToggleStatus = (id: number, currentStatus: string, campaignName: string) => {
    if (currentStatus === "active") {
      pauseMutation.mutate(id, { onSuccess: () => toast({ title: "Campaign Paused" }) });
    } else {
      launchMutation.mutate(id, {
        onSuccess: () => {
          toast({ title: "Campaign Launched" });
          // Open pipeline progress panel and show inline bar
          openPanel(id, campaignName);
          addInlineBar(id);
        },
      });
    }
  };

  const displayData = (campaigns || []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(displayData.length / PAGE_SIZE));
  const paginatedData = displayData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);


  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {/* ── Realtime pipeline panel ─────────────────────────────────── */}
      <CampaignAnalyticsPanel
        campaign={analyticsCampaign}
        open={analyticsCampaign !== null}
        onClose={closeAnalytics}
      />
      <CampaignPipelinePanel
        campaignId={panelCampaignId}
        campaignName={panelCampaignName}
        open={panelCampaignId !== null}
        onClose={closePanel}
      />

      <PageHeader 
        title="Campaigns" 
        description="Manage your automated outbound and reactivation sequences."
      >
        <Button className="gradient-primary text-white shadow-lg hover:opacity-90 transition-opacity h-8 px-4 text-sm rounded-xl border-0 gap-1.5" onClick={() => setDialogOpen(true)}>
          <Megaphone className="w-3.5 h-3.5" /> New Campaign
        </Button>
      </PageHeader>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm({
          setFormName, setFormType, setFormSubject,
          setLeadsOpen, setLeadSearch, setSelectedLeadIds,
          setSeqOpen, setSeqSearch, setSelectedTemplateIds, setCustomSteps,
        });
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold gradient-text">Create New Campaign</DialogTitle>
            <p className="text-xs text-muted-foreground pt-1">
              The AI agent handles lead sourcing &amp; email writing autonomously. Expand the optional sections below to override with your own selection.
            </p>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="grid gap-4 py-4">
              {/* ── Required fields ────────────────────────────── */}
              <div className="grid gap-2">
                <Label htmlFor="camp-name">Campaign Name <span className="text-destructive">*</span></Label>
                <Input
                  id="camp-name"
                  placeholder="e.g. Q2 Outbound – SaaS Founders"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="camp-type">Campaign Type <span className="text-destructive">*</span></Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger id="camp-type">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="reactivation">CRM Reactivation</SelectItem>
                    <SelectItem value="inbound">Inbound Follow-up</SelectItem>
                    <SelectItem value="nurture">Nurture Sequence</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="camp-subject">Email Subject Line <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="camp-subject"
                  placeholder="e.g. Quick question about {{company}}"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                />
              </div>

              <Separator />

              {/* ── Optional: Leads ─────────────────────────────── */}
              <Collapsible open={leadsOpen} onOpenChange={setLeadsOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-sm font-medium hover:bg-muted/40 hover:border-primary/20 transition-all">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span>Manually select leads</span>
                      {selectedLeadIds.size > 0 && (
                        <Badge variant="secondary" className="ml-1">{selectedLeadIds.size} selected</Badge>
                      )}
                      <span className="text-muted-foreground font-normal text-xs">(optional — AI picks leads if left empty)</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${leadsOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-8 text-sm"
                      placeholder="Search leads by name, company or email…"
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                    />
                  </div>
                  {eligibleLeads.length === 0 && allLeads.length > 0 && (
                    <p className="text-xs text-muted-foreground px-1">All leads are already completed.</p>
                  )}
                  {filteredLeads.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 px-1 pb-1">
                        <Checkbox
                          id="select-all-leads"
                          checked={allLeadsSelected}
                          onCheckedChange={toggleAllLeads}
                        />
                        <label htmlFor="select-all-leads" className="text-xs font-medium cursor-pointer select-none">
                          Select all ({filteredLeads.length} eligible)
                        </label>
                      </div>
                      <ScrollArea className="h-44 rounded-md border border-border/50">
                        <div className="divide-y divide-border/40">
                          {filteredLeads.map((lead) => (
                            <label
                              key={lead.id}
                              htmlFor={`lead-${lead.id}`}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer transition-colors"
                            >
                              <Checkbox
                                id={`lead-${lead.id}`}
                                checked={selectedLeadIds.has(lead.id)}
                                onCheckedChange={() => toggleLead(lead.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {lead.firstName} {lead.lastName}
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">{lead.email}</span>
                                </p>
                                <p className="text-xs text-muted-foreground truncate">{lead.title} · {lead.company}</p>
                              </div>
                              <Badge
                                variant="outline"
                                className={`shrink-0 text-[10px] capitalize ${
                                  lead.status === "active"   ? "border-green-500/40 text-green-600"  :
                                  lead.status === "new"      ? "border-primary/40 text-primary"      :
                                  lead.status === "paused"   ? "border-yellow-500/40 text-yellow-600" :
                                  "border-border text-muted-foreground"
                                }`}
                              >
                                {lead.status}
                              </Badge>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* ── Optional: Email Sequence ─────────────────────── */}
              <Collapsible open={seqOpen} onOpenChange={setSeqOpen}>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-sm font-medium hover:bg-muted/40 hover:border-primary/20 transition-all">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      <span>Add email sequence</span>
                      {(selectedTemplateIds.size + customSteps.length) > 0 && (
                        <Badge variant="secondary" className="ml-1">{selectedTemplateIds.size + customSteps.length} step{(selectedTemplateIds.size + customSteps.length) !== 1 ? "s" : ""}</Badge>
                      )}
                      <span className="text-muted-foreground font-normal text-xs">(optional — AI writes emails if left empty)</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${seqOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-3">
                  {/* Templates from DB */}
                  {templates.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground px-1">From your prompt templates</p>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="pl-8 h-8 text-sm"
                          placeholder="Search templates…"
                          value={seqSearch}
                          onChange={(e) => setSeqSearch(e.target.value)}
                        />
                      </div>
                      <ScrollArea className="h-36 rounded-md border border-border/50">
                        <div className="divide-y divide-border/40">
                          {filteredTemplates.map((t) => (
                            <label
                              key={t.id}
                              htmlFor={`tmpl-${t.id}`}
                              className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer transition-colors"
                            >
                              <Checkbox
                                id={`tmpl-${t.id}`}
                                checked={selectedTemplateIds.has(t.id)}
                                onCheckedChange={() => toggleTemplate(t.id)}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{t.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{t.template.slice(0, 80)}{t.template.length > 80 ? "…" : ""}</p>
                              </div>
                              <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{t.type}</Badge>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Custom steps */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground px-1">Custom email steps</p>
                    {customSteps.length > 0 && (
                      <div className="space-y-1">
                        {customSteps.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                            <span className="text-xs font-medium text-muted-foreground shrink-0 mt-0.5">Step {idx + 1}</span>
                            <p className="flex-1 text-xs text-foreground break-words">{step}</p>
                            <button
                              type="button"
                              onClick={() => removeCustomStep(idx)}
                              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        className="text-sm"
                        placeholder="Paste or type an email template / prompt…"
                        value={newStep}
                        onChange={(e) => setNewStep(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomStep())}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={addCustomStep} disabled={!newStep.trim()}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* AI note */}
              {!leadsOpen && !seqOpen && (
                <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">AI-driven mode:</span> The agent will autonomously source leads, craft personalised emails, and manage the sending sequence.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="pt-3 border-t border-border/40 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              className="gradient-primary text-white border-0 hover:opacity-90"
              onClick={handleCreate}
              disabled={!formName.trim() || !formType || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input 
            placeholder="Search campaigns…" 
            className="pl-9 h-9 text-sm bg-muted/40 border-border/50 rounded-xl focus:bg-card"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          {displayData.length} campaign{displayData.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Campaign Name</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Status</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Type</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Sent</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Open Rate</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Reply Rate</th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Meetings</th>
              <th className="px-5 py-3.5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Loading campaigns…</span>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((campaign) => (
                <>
                  <tr key={campaign.id} className="group hover:bg-primary/3 transition-colors duration-150">
                    <td className="px-5 py-3.5 font-medium text-foreground">{campaign.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        campaign.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-500 shadow-[0_0_8px_rgb(16,185,129,0.15)]'
                          : campaign.status === 'paused'
                          ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-muted/60 text-muted-foreground'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          campaign.status === 'active' ? 'bg-emerald-500' :
                          campaign.status === 'paused' ? 'bg-amber-500' : 'bg-muted-foreground'
                        }`} />
                        {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-muted-foreground capitalize bg-muted/50 px-2 py-0.5 rounded-md">
                        {campaign.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-foreground/80">{(campaign.sentCount ?? 0).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-foreground/80">
                      {(campaign.sentCount ?? 0) > 0 ? (((campaign.openCount ?? 0) / (campaign.sentCount ?? 0)) * 100).toFixed(1) + '%' : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-foreground/80">
                      {(campaign.sentCount ?? 0) > 0 ? (((campaign.replyCount ?? 0) / (campaign.sentCount ?? 0)) * 100).toFixed(1) + '%' : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-foreground">{campaign.meetingsBooked}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 rounded-lg hover:bg-muted"
                          onClick={() => handleToggleStatus(campaign.id, campaign.status, campaign.name)}
                          disabled={campaign.status === 'draft'}
                        >
                          {campaign.status === 'active' ? (
                            <Pause className="w-3.5 h-3.5 text-amber-500" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-muted">
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-sm">
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => {
                                openPanel(campaign.id, campaign.name);
                                addInlineBar(campaign.id);
                              }}
                            >
                              <Activity className="mr-2 h-3.5 w-3.5" /> View Pipeline
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => openAnalytics({
                                id:             campaign.id,
                                name:           campaign.name,
                                status:         campaign.status,
                                type:           campaign.type,
                                sentCount:      campaign.sentCount ?? 0,
                                openCount:      campaign.openCount ?? 0,
                                replyCount:     campaign.replyCount ?? 0,
                                meetingsBooked: campaign.meetingsBooked ?? 0,
                              })}
                            >
                              <ArrowUpRight className="mr-2 h-3.5 w-3.5" /> View Analytics
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer">Edit Sequence</DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                  {/* Inline progress strip — shown independently per campaign */}
                  <AnimatePresence>
                    {activePipelineIds.has(campaign.id) && (
                      <tr key={`pipeline-${campaign.id}`}>
                        <td colSpan={8} className="p-0">
                          <CampaignProgressInline
                            campaignId={campaign.id}
                            onExpandClick={() => openPanel(campaign.id, campaign.name)}
                            onClose={() => removeInlineBar(campaign.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {!isLoading && displayData.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-xs text-muted-foreground">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, displayData.length)} of {displayData.length} campaigns
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-lg"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={page === currentPage ? "default" : "outline"}
                size="icon"
                className={`h-7 w-7 rounded-lg text-xs ${
                  page === currentPage ? "bg-primary text-primary-foreground" : ""
                }`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-lg"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
