import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, MousePointerClick, CalendarCheck, Bot, Globe, Users, Send, Sparkles } from "lucide-react";
import { useLeads } from "@/hooks/use-leads";

export default function Conversion() {
  const [activeTab, setActiveTab] = useState("chatbot");
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([
    { role: "assistant", content: "Hi there! I'm your AI sales assistant. How can I help you learn about our platform today?" },
  ]);
  const { data: leads } = useLeads();

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
        <TabsList className="bg-muted/50">
          <TabsTrigger value="chatbot">AI Chatbot Preview</TabsTrigger>
          <TabsTrigger value="leads">Website Leads</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
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

        <TabsContent value="config" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Chatbot Settings</CardTitle>
                <CardDescription>Configure how the AI chatbot interacts with visitors.</CardDescription>
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
                  <Label>Company Description</Label>
                  <Textarea
                    defaultValue="We provide an AI-powered revenue platform that helps B2B companies automate pipeline generation through autonomous outbound, CRM reactivation, and website conversion agents."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Qualification Criteria</Label>
                  <Input defaultValue="Company size > 50 employees, B2B SaaS, Active buying cycle" />
                </div>
                <Button>Save Configuration</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Integration Status</CardTitle>
                <CardDescription>Connected services for the conversion agent.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: "Calendly", status: "connected", desc: "Meeting scheduling" },
                  { name: "Tidio", status: "disconnected", desc: "Live chat widget" },
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
