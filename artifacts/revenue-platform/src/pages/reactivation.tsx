import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCcw, Users, Mail, Clock, CheckCircle2, AlertCircle, ArrowRight, Zap, Target } from "lucide-react";
import { useLeads } from "@/hooks/use-leads";
import { useCampaigns } from "@/hooks/use-campaigns";

const statusColor: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400",
  contacted: "bg-yellow-500/10 text-yellow-400",
  qualified: "bg-green-500/10 text-green-400",
  replied: "bg-purple-500/10 text-purple-400",
  meeting_booked: "bg-emerald-500/10 text-emerald-400",
};

export default function Reactivation() {
  const [activeTab, setActiveTab] = useState("dormant");
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();

  const dormantLeads = leads?.filter(l => l.source === "reactivation") ?? [];
  const reactivationCampaigns = campaigns?.filter(c => c.type === "reactivation") ?? [];

  const stats = [
    { label: "Dormant Leads", value: dormantLeads.length.toString(), icon: Users, color: "text-blue-400" },
    { label: "Reactivation Campaigns", value: reactivationCampaigns.length.toString(), icon: RefreshCcw, color: "text-purple-400" },
    { label: "Re-engaged", value: dormantLeads.filter(l => l.status === "replied" || l.status === "meeting_booked").length.toString(), icon: CheckCircle2, color: "text-green-400" },
    { label: "Meetings Booked", value: reactivationCampaigns.reduce((sum, c) => sum + (c.meetingsBooked ?? 0), 0).toString(), icon: Target, color: "text-emerald-400" },
  ];

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
        <TabsList className="bg-muted/50">
          <TabsTrigger value="dormant">Dormant Leads</TabsTrigger>
          <TabsTrigger value="campaigns">Reactivation Campaigns</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
        </TabsList>

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

        <TabsContent value="campaigns" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Reactivation Campaigns</CardTitle>
              <CardDescription>Track your automated re-engagement campaigns.</CardDescription>
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
                  {reactivationCampaigns.map(campaign => (
                    <Card key={campaign.id} className="bg-muted/30">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold">{campaign.name}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{campaign.subject}</p>
                          </div>
                          <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                            {campaign.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-4 mt-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Sent</p>
                            <p className="font-semibold">{campaign.sentCount?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Opened</p>
                            <p className="font-semibold">{campaign.openCount?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Replies</p>
                            <p className="font-semibold">{campaign.replyCount?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Meetings</p>
                            <p className="font-semibold">{campaign.meetingsBooked}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflow" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Reactivation Workflow</CardTitle>
              <CardDescription>How the AI Reactivation Agent works.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {[
                  { step: 1, title: "CRM Import", desc: "Import dormant leads from HubSpot, GoHighLevel, or CSV. Filter by inactivity period.", icon: Users, color: "text-blue-400" },
                  { step: 2, title: "AI Analysis", desc: "AI analyzes deal history, engagement patterns, and identifies the best re-engagement strategy.", icon: Zap, color: "text-purple-400" },
                  { step: 3, title: "Personalized Sequences", desc: "Generate tailored re-engagement email sequences based on each lead's profile and past interactions.", icon: Mail, color: "text-green-400" },
                  { step: 4, title: "Automated Follow-up", desc: "Schedule and send sequences with smart timing. Auto-respond to replies and book meetings.", icon: Clock, color: "text-orange-400" },
                  { step: 5, title: "Meeting Conversion", desc: "Qualified leads are auto-routed to your calendar via Calendly integration.", icon: Target, color: "text-emerald-400" },
                ].map((item, i) => (
                  <div key={item.step} className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">Step {item.step}: {item.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
                    </div>
                    {i < 4 && <ArrowRight className="h-5 w-5 text-muted-foreground mt-2 hidden lg:block" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
