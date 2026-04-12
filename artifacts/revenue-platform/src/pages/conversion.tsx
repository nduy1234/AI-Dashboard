import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/molecules/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, MousePointerClick, CalendarCheck, Bot, Globe, Users, Send, Sparkles, FileText, Upload, Code2, Filter, ArrowDown, CheckCircle2, XCircle, Copy } from "lucide-react";
import { useLeads } from "@/hooks/use-leads";
import { useToast } from "@/hooks/use-toast";

export default function Conversion() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("chatbot");
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([
    { role: "assistant", content: "Hi there! I'm your AI sales assistant. How can I help you learn about our platform today?" },
  ]);
  const { data: leads } = useLeads();
  const [widgetColor, setWidgetColor] = useState("#7C3AED");
  const [widgetPosition, setWidgetPosition] = useState("bottom-right");

  const websiteLeads = leads?.filter(l => l.source === "website") ?? [];

  const stats = [
    { label: "Website Visitors", value: "12,450", icon: Globe, color: "text-blue-400" },
    { label: "Chat Conversations", value: "847", icon: MessageSquare, color: "text-purple-400" },
    { label: "Qualified Leads", value: websiteLeads.length.toString(), icon: Users, color: "text-green-400" },
    { label: "Demos Booked", value: "42", icon: CalendarCheck, color: "text-emerald-400" },
  ];

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;
    setChatHistory(prev => [
      ...prev,
      { role: "user", content: chatMessage },
      { role: "assistant", content: "Thanks for your interest! Based on what you've shared, I think our Growth plan would be a great fit. It includes all three AI agents — Outbound, Reactivation, and Conversion — with unlimited email sending. Would you like to schedule a quick demo to see it in action?" },
    ]);
    setChatMessage("");
  };

  const embedCode = `<script src="https://cdn.agentic-ai.com/widget.js"></script>
<script>
  AgenticChat.init({
    apiKey: "YOUR_API_KEY",
    color: "${widgetColor}",
    position: "${widgetPosition}",
    greeting: "Hi! How can I help?"
  });
</script>`;

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    toast({ title: "Copied", description: "Embed code copied to clipboard." });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <PageHeader
        title="Website Conversion Agent"
        description="Convert website visitors into qualified leads and booked meetings with AI-powered chat."
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
          <TabsTrigger value="chatbot">AI Chatbot Preview</TabsTrigger>
          <TabsTrigger value="knowledge-base">Knowledge Base</TabsTrigger>
          <TabsTrigger value="qualification">Qualification Flow</TabsTrigger>
          <TabsTrigger value="leads">Website Leads</TabsTrigger>
          <TabsTrigger value="widget">Widget Configurator</TabsTrigger>
        </TabsList>

        <TabsContent value="chatbot" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="h-[500px] flex flex-col">
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">AI Sales Assistant</CardTitle>
                    <CardDescription className="text-xs">Online</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </CardContent>
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Type a message..."
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  />
                  <Button size="icon" onClick={handleSendMessage}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  How It Works
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { title: "Visitor Detection", desc: "Identifies and tracks website visitors in real-time" },
                  { title: "AI Engagement", desc: "Proactively engages visitors with contextual conversations" },
                  { title: "Lead Qualification", desc: "Scores visitors based on company size, budget, and timeline" },
                  { title: "Auto-Booking", desc: "Books qualified leads directly into your Calendly calendar" },
                  { title: "CRM Sync", desc: "Automatically creates lead records in your connected CRM" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">{i + 1}</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="knowledge-base" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  Upload Documents
                </CardTitle>
                <CardDescription>Feed your AI chatbot with company knowledge.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Drop files here or click to upload</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MD (max 10MB each)</p>
                  <Button variant="outline" size="sm" className="mt-4">Browse Files</Button>
                </div>
                <div className="space-y-2">
                  <Label>Or paste content directly</Label>
                  <Textarea rows={4} placeholder="Paste product documentation, FAQs, pricing info..." />
                  <Button size="sm" className="w-full">Add to Knowledge Base</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Knowledge Base Documents</CardTitle>
                <CardDescription>Documents the AI chatbot uses to answer visitor questions.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { title: "Product Overview", type: "Documentation", status: "indexed" },
                      { title: "Pricing FAQ", type: "FAQ", status: "indexed" },
                      { title: "Integration Guide", type: "Documentation", status: "indexed" },
                      { title: "Case Studies", type: "Marketing", status: "processing" },
                    ].map((doc, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {doc.title}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell"><Badge variant="secondary">{doc.type}</Badge></TableCell>
                        <TableCell>
                          <Badge className={doc.status === "indexed" ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"}>
                            {doc.status === "indexed" ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Indexed</> : "Processing..."}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">Remove</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="qualification" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-primary" />
                  Lead Qualification Flow
                </CardTitle>
                <CardDescription>Define the criteria the AI uses to qualify website visitors.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { step: 1, question: "Company Size", criteria: "> 50 employees", action: "Continue" },
                  { step: 2, question: "Industry Match", criteria: "B2B SaaS, Enterprise, Technology", action: "Continue" },
                  { step: 3, question: "Budget Available", criteria: "> $500/month", action: "Continue" },
                  { step: 4, question: "Timeline", criteria: "< 3 months", action: "Qualify & Book" },
                ].map((step, i, arr) => (
                  <div key={step.step}>
                    <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/20">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary">{step.step}</span>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{step.question}</p>
                          <Badge variant="outline" className="text-xs">{step.action}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Criteria: {step.criteria}</p>
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ArrowDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                <Button variant="outline" className="w-full">Add Qualification Step</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Qualification Outcomes</CardTitle>
                <CardDescription>What happens after each qualification result.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <p className="font-semibold text-green-500">Qualified (Score 70+)</p>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                    <li>Auto-suggest booking a demo via Calendly</li>
                    <li>Create lead in CRM with full conversation history</li>
                    <li>Notify sales rep via Slack/email</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-5 w-5 text-yellow-500" />
                    <p className="font-semibold text-yellow-500">Warm (Score 40-69)</p>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                    <li>Continue nurturing with relevant content</li>
                    <li>Add to email drip sequence</li>
                    <li>Offer resource download (whitepaper, case study)</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg border border-muted bg-muted/10">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                    <p className="font-semibold text-muted-foreground">Unqualified (Score &lt; 40)</p>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                    <li>Provide helpful resources and self-serve options</li>
                    <li>Save contact for future outreach</li>
                  </ul>
                </div>
                <Button className="w-full">Save Qualification Rules</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="leads" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Website-Sourced Leads</CardTitle>
              <CardDescription>Leads captured and qualified through the website conversion agent.</CardDescription>
            </CardHeader>
            <CardContent>
              {websiteLeads.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MousePointerClick className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No website leads yet</p>
                  <p className="text-sm mt-1">Website leads will appear here once visitors engage with the AI chatbot.</p>
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
                    {websiteLeads.map(lead => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead.firstName} {lead.lastName}</TableCell>
                        <TableCell>{lead.company}</TableCell>
                        <TableCell className="text-muted-foreground">{lead.title}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{lead.status}</Badge>
                        </TableCell>
                        <TableCell>{lead.engagementScore ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="widget" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-primary" />
                  Widget Configurator
                </CardTitle>
                <CardDescription>Customize and embed the chat widget on your website.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Welcome Message</Label>
                  <Textarea
                    defaultValue="Hi there! I'm your AI sales assistant. How can I help you learn about our platform today?"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Brand Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={widgetColor}
                      onChange={(e) => setWidgetColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input
                      value={widgetColor}
                      onChange={(e) => setWidgetColor(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Widget Position</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={widgetPosition}
                    onChange={(e) => setWidgetPosition(e.target.value)}
                  >
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Company Description</Label>
                  <Textarea
                    defaultValue="We provide an AI-powered revenue platform that helps B2B companies automate pipeline generation."
                    rows={3}
                  />
                </div>
                <Button>Save Configuration</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Embed Code</CardTitle>
                <CardDescription>Copy and paste this snippet into your website's HTML.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <pre className="bg-muted/50 rounded-lg p-4 text-xs font-mono overflow-x-auto border border-border">
                    {embedCode}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2 gap-1"
                    onClick={handleCopyEmbed}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium">Integration Status</p>
                  {[
                    { name: "Calendly", status: "connected", desc: "Meeting scheduling" },
                    { name: "Tidio", status: "disconnected", desc: "Live chat fallback" },
                    { name: "HubSpot", status: "connected", desc: "CRM sync" },
                  ].map(int => (
                    <div key={int.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="font-medium text-sm">{int.name}</p>
                        <p className="text-xs text-muted-foreground">{int.desc}</p>
                      </div>
                      <Badge variant={int.status === "connected" ? "default" : "secondary"}>
                        {int.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
