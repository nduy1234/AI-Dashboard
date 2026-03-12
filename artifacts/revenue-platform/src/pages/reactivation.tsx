import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCcw, Users, Mail, Clock, CheckCircle2, ArrowRight, Zap, Target, Database, Link2, BarChart3, Send, Wand2, TrendingUp } from "lucide-react";
import { useLeads } from "@/hooks/use-leads";
import { useCampaigns } from "@/hooks/use-campaigns";
import { useAIReactivation } from "@/hooks/use-ai";
import { useToast } from "@/hooks/use-toast";

const statusColor: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400",
  contacted: "bg-yellow-500/10 text-yellow-400",
  qualified: "bg-green-500/10 text-green-400",
  replied: "bg-purple-500/10 text-purple-400",
  meeting_booked: "bg-emerald-500/10 text-emerald-400",
};

export default function Reactivation() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("crm-import");
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
  const reactivationMutation = useAIReactivation();

  const dormantLeads = leads?.filter(l => l.source === "reactivation") ?? [];
  const reactivationCampaigns = campaigns?.filter(c => c.type === "reactivation") ?? [];
  const totalSent = reactivationCampaigns.reduce((s, c) => s + (c.sentCount ?? 0), 0);
  const totalReplies = reactivationCampaigns.reduce((s, c) => s + (c.replyCount ?? 0), 0);
  const totalMeetings = reactivationCampaigns.reduce((s, c) => s + (c.meetingsBooked ?? 0), 0);

  const stats = [
    { label: "Dormant Leads", value: dormantLeads.length.toString(), icon: Users, color: "text-blue-400" },
    { label: "Reactivation Campaigns", value: reactivationCampaigns.length.toString(), icon: RefreshCcw, color: "text-purple-400" },
    { label: "Re-engaged", value: dormantLeads.filter(l => l.status === "replied" || l.status === "meeting_booked").length.toString(), icon: CheckCircle2, color: "text-green-400" },
    { label: "Meetings Booked", value: totalMeetings.toString(), icon: Target, color: "text-emerald-400" },
  ];

  const handleGenerateReactivation = () => {
    const ids = dormantLeads.slice(0, 5).map(l => l.id);
    if (ids.length === 0) return;
    reactivationMutation.mutate({ leadIds: ids, channel: "email" }, {
      onSuccess: () => {
        toast({ title: "Reactivation Messages Generated", description: `AI generated personalized messages for ${ids.length} leads.` });
      },
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <PageHeader
        title="CRM Reactivation Agent"
        description="Re-engage dormant leads and lost deals with AI-powered outreach sequences."
      />

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
        </TabsList>

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
                {[
                  { name: "HubSpot", status: "connected", leads: "1,240 dormant leads found" },
                  { name: "GoHighLevel", status: "disconnected", leads: "Connect to scan" },
                  { name: "Salesforce", status: "disconnected", leads: "Connect to scan" },
                ].map(crm => (
                  <div key={crm.name} className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Link2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{crm.name}</p>
                        <p className="text-xs text-muted-foreground">{crm.leads}</p>
                      </div>
                    </div>
                    <Button variant={crm.status === "connected" ? "default" : "outline"} size="sm">
                      {crm.status === "connected" ? "Import Leads" : "Connect"}
                    </Button>
                  </div>
                ))}
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
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option>30+ days inactive</option>
                    <option>60+ days inactive</option>
                    <option>90+ days inactive</option>
                    <option>180+ days inactive</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Deal Stage Filter</Label>
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option>All lost/stalled deals</option>
                    <option>Lost at proposal stage</option>
                    <option>Lost at negotiation</option>
                    <option>Ghosted after demo</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Minimum Deal Value</Label>
                  <Input placeholder="$5,000" />
                </div>
                <Button className="w-full gap-2">
                  <Database className="h-4 w-4" /> Scan & Import
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dormant" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Dormant Lead Pool</CardTitle>
              <CardDescription>Leads imported from your CRM that have gone inactive.</CardDescription>
            </CardHeader>
            <CardContent>
              {leadsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
                </div>
              ) : dormantLeads.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No dormant leads yet</p>
                  <p className="text-sm mt-1">Import leads from your CRM to start reactivation campaigns.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dormantLeads.map(lead => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead.firstName} {lead.lastName}</TableCell>
                        <TableCell>{lead.company}</TableCell>
                        <TableCell className="text-muted-foreground">{lead.title}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusColor[lead.status] ?? ""}>{lead.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${lead.engagementScore ?? 0}%` }} />
                            </div>
                            <span className="text-sm text-muted-foreground">{lead.engagementScore ?? 0}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
                  <Input placeholder="Q1 Lost Deal Revival" />
                </div>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="email">Email</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="phone">Phone</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Reactivation Reason</Label>
                  <Textarea rows={3} placeholder="New product features, pricing changes, case studies..." />
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border text-sm">
                  <p className="font-medium">{dormantLeads.length} dormant leads available</p>
                  <p className="text-xs text-muted-foreground mt-1">Top 5 leads will be used for preview</p>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={handleGenerateReactivation}
                  disabled={reactivationMutation.isPending || dormantLeads.length === 0}
                >
                  <Wand2 className="h-4 w-4" />
                  {reactivationMutation.isPending ? "Generating..." : "AI Generate Messages"}
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Reactivation Sequence Preview</CardTitle>
                <CardDescription>AI-generated personalized re-engagement messages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { step: 1, delay: "Day 1", subject: "Checking in - new developments at {{company}}", desc: "Warm re-introduction referencing past interaction and new product features." },
                  { step: 2, delay: "Day 4", subject: "Quick case study from your industry", desc: "Share relevant success story from a similar company in their industry." },
                  { step: 3, delay: "Day 8", subject: "Worth 15 minutes, {{firstName}}?", desc: "Direct ask for a brief call with specific value proposition." },
                ].map(item => (
                  <div key={item.step} className="p-4 rounded-lg border border-border bg-muted/20">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">{item.step}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.subject}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{item.delay}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground ml-11">{item.desc}</p>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="flex justify-end gap-3 border-t pt-4">
                <Button variant="outline">Edit Sequence</Button>
                <Button className="gap-2">
                  <Send className="h-4 w-4" /> Launch Reactivation
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="execution" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Execution Status</CardTitle>
              <CardDescription>Track your active reactivation campaigns in real-time.</CardDescription>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => <div key={i} className="h-24 bg-muted rounded animate-pulse" />)}
                </div>
              ) : reactivationCampaigns.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No reactivation campaigns</p>
                  <p className="text-sm mt-1">Create a campaign to start re-engaging dormant leads.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reactivationCampaigns.map(campaign => {
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
                    <span className="font-bold text-lg">${(Math.floor(totalMeetings * 0.3) * 12000).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">ROI</span>
                    <span className="font-bold text-lg text-green-500">340%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Campaign Performance Comparison</CardTitle>
                <CardDescription>See how each reactivation campaign contributes to revenue.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Re-engaged</TableHead>
                      <TableHead>Meetings</TableHead>
                      <TableHead>Pipeline Value</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reactivationCampaigns.map(campaign => (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium">{campaign.name}</TableCell>
                        <TableCell>{campaign.leadCount}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3 text-green-500" />
                            {campaign.replyCount}
                          </div>
                        </TableCell>
                        <TableCell>{campaign.meetingsBooked}</TableCell>
                        <TableCell className="font-medium text-green-500">
                          ${((campaign.meetingsBooked ?? 0) * 8500).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                            {campaign.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
