import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@workspace/replit-auth-web";
import { Settings as SettingsIcon, Users, Key, FileText, Shield, Plus, Trash2, Copy, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTeamMembers,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  listPromptTemplates,
  createPromptTemplate,
  deletePromptTemplate,
  getListTeamMembersQueryKey,
  getListApiKeysQueryKey,
  getListPromptTemplatesQueryKey,
  type TeamMember,
  type ApiKey,
  type PromptTemplate,
} from "@workspace/api-client-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data: teamMembers } = useQuery({
    queryKey: getListTeamMembersQueryKey(),
    queryFn: () => listTeamMembers({ credentials: "include" }),
  });

  const { data: apiKeys } = useQuery({
    queryKey: getListApiKeysQueryKey(),
    queryFn: () => listApiKeys({ credentials: "include" }),
  });

  const { data: promptTemplates } = useQuery({
    queryKey: getListPromptTemplatesQueryKey(),
    queryFn: () => listPromptTemplates({ credentials: "include" }),
  });

  const createKeyMutation = useMutation({
    mutationFn: (name: string) => createApiKey({ name }, { credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
      setNewKeyName("");
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (id: number) => deleteApiKey(id, { credentials: "include" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() }),
  });

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your workspace, team, API keys, and AI prompt templates."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="prompts">Prompt Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5" />
                  Workspace Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Workspace Name</Label>
                  <Input defaultValue="My Revenue Platform" />
                </div>
                <div className="space-y-2">
                  <Label>Company Website</Label>
                  <Input defaultValue="https://mycompany.com" />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input defaultValue="B2B SaaS" />
                </div>
                <Button>Save Changes</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Notifications & Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Email notifications for new leads", enabled: true },
                  { label: "Daily campaign performance digest", enabled: true },
                  { label: "Meeting booking alerts", enabled: true },
                  { label: "Weekly analytics summary", enabled: false },
                  { label: "AI agent error alerts", enabled: true },
                ].map((pref) => (
                  <div key={pref.label} className="flex items-center justify-between">
                    <span className="text-sm">{pref.label}</span>
                    <Switch defaultChecked={pref.enabled} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>Manage who has access to this workspace.</CardDescription>
                </div>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Invite Member</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(teamMembers ?? []).map((member: TeamMember) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {member.profileImageUrl ? (
                            <img src={member.profileImageUrl} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                              {(member.firstName?.[0] ?? "U")}
                            </div>
                          )}
                          {member.firstName} {member.lastName}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{member.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{member.role}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Manage API keys for external integrations and automation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter key name (e.g., Production API)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
                <Button
                  onClick={() => newKeyName && createKeyMutation.mutate(newKeyName)}
                  disabled={!newKeyName || createKeyMutation.isPending}
                >
                  <Plus className="h-4 w-4 mr-2" /> Generate Key
                </Button>
              </div>

              {(apiKeys ?? []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No API keys created yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(apiKeys ?? []).map((key: ApiKey) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {key.key.slice(0, 12)}...{key.key.slice(-4)}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleCopyKey(key.key)}
                            >
                              {copiedKey === key.key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => deleteKeyMutation.mutate(key.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Prompt Templates</CardTitle>
                  <CardDescription>Customize AI-generated email templates and chat responses.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(promptTemplates ?? []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No prompt templates yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(promptTemplates ?? []).map((template: PromptTemplate) => (
                    <Card key={template.id} className="bg-muted/30">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm">{template.name}</h4>
                            <Badge variant="secondary" className="text-xs">{template.type}</Badge>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-background/50 rounded p-3 mt-2">
                          {template.template}
                        </pre>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
