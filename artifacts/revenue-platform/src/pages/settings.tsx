import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/molecules/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Settings as SettingsIcon, Users, Key, FileText, Shield, Plus, Trash2, Copy,
  Check, User, CreditCard, Zap, Calendar, Clock, AlertTriangle, ExternalLink,
  CheckCircle2, XCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserMe, useBillingPortal, useStartTrial } from "@/hooks/use-subscription";
import { UpgradeModal } from "@/components/molecules/upgrade-modal";
import { cn } from "@/lib/utils";
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
  const [activeTab, setActiveTab] = useState("profile");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { user: meUser, isPro, status, daysLeft, isLoading: subLoading } = useUserMe();
  const portalMutation = useBillingPortal();
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
        <TabsList className="bg-muted/50 h-auto flex-wrap gap-1">
          <TabsTrigger value="profile" className="gap-1.5"><User className="w-3.5 h-3.5" />Profile</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>

        {/* ── Profile + Subscription ─────────────────────────────────────── */}
        <TabsContent value="profile" className="mt-6">
          <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Profile card */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[15px]">
                  <User className="w-4 h-4" /> Profile
                </CardTitle>
                <CardDescription>Your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  {user?.profileImageUrl ? (
                    <img src={user.profileImageUrl} alt="avatar"
                      className="w-14 h-14 rounded-full ring-2 ring-border object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center text-xl font-bold text-primary">
                      {(user?.firstName?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {user?.firstName && user?.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user?.email ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email ?? "—"}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">First name</span>
                    <span className="font-medium">{user?.firstName ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last name</span>
                    <span className="font-medium">{user?.lastName ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium truncate max-w-[160px]">{user?.email ?? "—"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subscription card */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[15px]">
                  <CreditCard className="w-4 h-4" /> Subscription
                </CardTitle>
                <CardDescription>Your current plan and billing details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {subLoading ? (
                  <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground text-sm">
                    <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    Loading subscription…
                  </div>
                ) : (
                  <>
                    {/* Plan row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          isPro ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                        )}>
                          <Zap className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {isPro ? "Pro Plan" : "Free Plan"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isPro ? "$149 / month" : "Limited access"}
                          </p>
                        </div>
                      </div>
                      <PlanBadge status={status} isPro={isPro} />
                    </div>

                    <Separator />

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <DetailCell
                        icon={<CheckCircle2 className="w-4 h-4" />}
                        label="Status"
                        value={<PlanBadge status={status} isPro={isPro} />}
                      />
                      <DetailCell
                        icon={<Calendar className="w-4 h-4" />}
                        label={status === "trialing" ? "Trial ends" : "Next billing"}
                        value={
                          meUser?.subscriptionExpiry
                            ? new Date(meUser.subscriptionExpiry).toLocaleDateString("en-US", {
                                month: "long", day: "numeric", year: "numeric",
                              })
                            : "—"
                        }
                      />
                      <DetailCell
                        icon={<Clock className="w-4 h-4" />}
                        label={status === "trialing" ? "Trial days left" : "Days until renewal"}
                        value={
                          daysLeft !== null
                            ? <span className={cn(
                                "font-semibold",
                                daysLeft <= 3 ? "text-amber-500" : "text-foreground",
                              )}>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</span>
                            : "—"
                        }
                      />
                      <DetailCell
                        icon={<CreditCard className="w-4 h-4" />}
                        label="Payment method"
                        value={meUser?.stripeCustomerId ? "Card on file ✓" : "None"}
                      />
                    </div>

                    {/* What's included */}
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        {isPro ? "Your Pro features" : "Free plan includes"}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4">
                        {(isPro ? PRO_FEATURES : FREE_FEATURES).map((f) => (
                          <div key={f} className="flex items-center gap-2 text-[12px]">
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="text-foreground/80">{f}</span>
                          </div>
                        ))}
                        {!isPro && LOCKED_FEATURES.map((f) => (
                          <div key={f} className="flex items-center gap-2 text-[12px]">
                            <XCircle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                            <span className="text-muted-foreground/50 line-through">{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* past_due warning */}
                    {status === "past_due" && (
                      <div className="flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 dark:text-red-400 px-4 py-3 text-[13px]">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="font-medium">Payment failed.</span>
                        <span className="opacity-80">Update your payment method to restore access.</span>
                      </div>
                    )}

                    {/* CTA buttons */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {isPro || status === "trialing" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[12px] gap-1.5"
                          onClick={() => portalMutation.mutate({})}
                          disabled={portalMutation.isPending}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {portalMutation.isPending ? "Opening…" : "Manage Subscription"}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 text-[12px] gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                          onClick={() => setUpgradeOpen(true)}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Upgrade to Pro
                        </Button>
                      )}
                      {(status === "past_due") && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-[12px] gap-1.5"
                          onClick={() => portalMutation.mutate({})}
                          disabled={portalMutation.isPending}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Update Payment
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

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

        <TabsContent value="team" className="mt-6 space-y-6">
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
                    <TableHead>Actions</TableHead>
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
                        <select
                          className="h-8 px-2 rounded-md border border-input bg-background text-xs"
                          defaultValue={member.role ?? "member"}
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Role Permissions
              </CardTitle>
              <CardDescription>Define what each role can access and modify.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Permission</TableHead>
                    <TableHead className="text-center">Owner</TableHead>
                    <TableHead className="text-center">Admin</TableHead>
                    <TableHead className="text-center">Member</TableHead>
                    <TableHead className="text-center">Viewer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { perm: "Manage team members", owner: true, admin: true, member: false, viewer: false },
                    { perm: "Create & launch campaigns", owner: true, admin: true, member: true, viewer: false },
                    { perm: "Import & manage leads", owner: true, admin: true, member: true, viewer: false },
                    { perm: "Configure integrations", owner: true, admin: true, member: false, viewer: false },
                    { perm: "Manage API keys", owner: true, admin: true, member: false, viewer: false },
                    { perm: "Edit prompt templates", owner: true, admin: true, member: true, viewer: false },
                    { perm: "View analytics", owner: true, admin: true, member: true, viewer: true },
                    { perm: "Use AI agents", owner: true, admin: true, member: true, viewer: false },
                    { perm: "Billing & subscription", owner: true, admin: false, member: false, viewer: false },
                  ].map((row) => (
                    <TableRow key={row.perm}>
                      <TableCell className="font-medium text-sm">{row.perm}</TableCell>
                      {[row.owner, row.admin, row.member, row.viewer].map((enabled, i) => (
                        <TableCell key={i} className="text-center">
                          <Switch defaultChecked={enabled} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex justify-end">
                <Button>Save Permissions</Button>
              </div>
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRO_FEATURES = [
  "Unlimited prospects",
  "Unlimited campaigns",
  "AI outbound agent",
  "Reactivation workflows",
  "HubSpot / CRM sync",
  "Advanced analytics",
  "Priority support",
];

const FREE_FEATURES = [
  "Up to 100 prospects",
  "1 active campaign",
  "Basic analytics",
  "Email support",
];

const LOCKED_FEATURES = [
  "AI outbound agent",
  "Reactivation workflows",
  "HubSpot / CRM sync",
  "Priority support",
];

type StatusVariant = "none" | "trialing" | "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "incomplete_expired" | "paused";

function PlanBadge({ status, isPro }: { status: StatusVariant | string; isPro: boolean }) {
  const cfg: Record<string, { label: string; className: string }> = {
    active:   { label: "Active",    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    trialing: { label: "Trial",     className: "bg-primary/15 text-primary border-primary/20" },
    past_due: { label: "Past Due",  className: "bg-red-500/15 text-red-500 border-red-500/20" },
    canceled: { label: "Canceled",  className: "bg-muted text-muted-foreground border-border" },
    unpaid:   { label: "Unpaid",    className: "bg-red-500/15 text-red-500 border-red-500/20" },
    none:     { label: "Free",      className: "bg-muted text-muted-foreground border-border" },
  };
  const { label, className } = cfg[status] ?? cfg.none;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border", className)}>
      {label}
    </span>
  );
}

function DetailCell({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40 border border-border/40">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
        <div className="text-[13px] font-medium">{value}</div>
      </div>
    </div>
  );
}
