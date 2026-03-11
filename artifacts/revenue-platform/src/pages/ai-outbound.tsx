import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Upload, Mail, Wand2, Plus, ArrowRight, CheckCircle2 } from "lucide-react";
import { useImportLeads } from "@/hooks/use-leads";
import { useAIPersonalize } from "@/hooks/use-ai";
import { useToast } from "@/hooks/use-toast";

export default function AIOutbound() {
  const { toast } = useToast();
  const importMutation = useImportLeads();
  const personalizeMutation = useAIPersonalize();
  
  const [activeTab, setActiveTab] = useState("sourcing");
  const [promptContext, setPromptContext] = useState("We are selling a B2B SaaS platform for revenue teams.");

  const handleImport = () => {
    importMutation.mutate({ source: "apollo", filters: {} }, {
      onSuccess: () => {
        toast({
          title: "Leads Imported",
          description: "Successfully imported leads from Apollo.",
        });
      }
    });
  };

  const handleGenerate = () => {
    personalizeMutation.mutate({ leadId: 1, templateType: "cold_outreach", context: promptContext }, {
      onSuccess: () => {
        toast({
          title: "AI Personalization Generated",
          description: "Subject lines and email copy have been drafted.",
        });
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <PageHeader 
        title="AI Outbound Agent" 
        description="Automate lead sourcing, verification, and hyper-personalized outreach."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 border border-border/50 rounded-xl h-auto">
          <TabsTrigger value="sourcing" className="py-2.5 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            1. Lead Sourcing
          </TabsTrigger>
          <TabsTrigger value="mailboxes" className="py-2.5 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            2. Mailboxes
          </TabsTrigger>
          <TabsTrigger value="personalization" className="py-2.5 px-4 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            3. AI Personalization
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sourcing" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle>Apollo Integration</CardTitle>
                <CardDescription>Pull leads directly from saved searches</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Saved Search URL</Label>
                  <div className="flex gap-2">
                    <Input placeholder="https://app.apollo.io/#/people..." className="bg-background" />
                    <Button onClick={handleImport} disabled={importMutation.isPending}>
                      {importMutation.isPending ? "Importing..." : "Import"}
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4 mt-6">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>Auto-verification enabled via MillionVerifier</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>Scraping LinkedIn data for personalization</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm border-dashed bg-muted/10">
              <CardContent className="flex flex-col items-center justify-center h-full p-10 text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Upload CSV</h3>
                  <p className="text-sm text-muted-foreground mt-1">Drag and drop your lead list here, or click to browse.</p>
                </div>
                <Button variant="outline" className="mt-4">Browse Files</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="mailboxes" className="mt-0">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Sending Infrastructure</CardTitle>
                <CardDescription>Manage connected inboxes and daily limits</CardDescription>
              </div>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> Add Mailbox
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Account</th>
                      <th className="px-4 py-3 font-medium">Provider</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Sent Today</th>
                      <th className="px-4 py-3 font-medium">Daily Limit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="bg-background">
                      <td className="px-4 py-3 font-medium">john@outbound.agentic.ai</td>
                      <td className="px-4 py-3 text-muted-foreground">Google Workspace</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-600">Active</span></td>
                      <td className="px-4 py-3">24</td>
                      <td className="px-4 py-3">40</td>
                    </tr>
                    <tr className="bg-background">
                      <td className="px-4 py-3 font-medium">sarah@outbound.agentic.ai</td>
                      <td className="px-4 py-3 text-muted-foreground">Google Workspace</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-600">Active</span></td>
                      <td className="px-4 py-3">38</td>
                      <td className="px-4 py-3">40</td>
                    </tr>
                    <tr className="bg-background">
                      <td className="px-4 py-3 font-medium">hello@outbound.agentic.ai</td>
                      <td className="px-4 py-3 text-muted-foreground">Microsoft 365</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-500/10 text-yellow-600">Warming Up</span></td>
                      <td className="px-4 py-3">5</td>
                      <td className="px-4 py-3">15</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personalization" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle>AI Prompt Context</CardTitle>
                <CardDescription>Train the agent on your offer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Value Proposition</Label>
                  <Textarea 
                    rows={6} 
                    className="resize-none"
                    value={promptContext}
                    onChange={(e) => setPromptContext(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option>Professional & Direct</option>
                    <option>Casual & Friendly</option>
                    <option>Challenger Sale</option>
                  </select>
                </div>
                <Button 
                  className="w-full gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                  onClick={handleGenerate}
                  disabled={personalizeMutation.isPending}
                >
                  <Wand2 className="w-4 h-4" />
                  {personalizeMutation.isPending ? "Generating..." : "Generate Sample"}
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle>Preview output for: <span className="text-primary">Jane Doe (CTO at TechCorp)</span></CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/30 rounded-xl p-6 border border-border">
                  <div className="text-sm font-medium text-muted-foreground mb-4 border-b border-border/50 pb-4">
                    <p><span className="text-foreground">Subject:</span> TechCorp's engineering velocity</p>
                  </div>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                    <p>Hi Jane,</p>
                    <p>Noticed TechCorp recently raised Series B and is hiring heavily for backend roles. With that rapid scaling, maintaining engineering velocity usually becomes a bottleneck.</p>
                    <p>We built Agentic AI to automate the repetitive parts of your workflow, letting your senior engineers focus on architecture rather than boilerplate.</p>
                    <p>Open to a brief chat next week to see how we compare to your current internal tooling?</p>
                    <p>Best,<br/>Alex</p>
                  </div>
                </div>
                
                <div className="flex justify-end gap-3">
                  <Button variant="outline">Regenerate</Button>
                  <Button className="gap-2">
                    Create Campaign <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
