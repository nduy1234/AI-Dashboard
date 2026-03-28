import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/molecules/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Play, 
  Pause, 
  Search, 
  MoreHorizontal, 
  Megaphone,
  ArrowUpRight
} from "lucide-react";
import { useCampaigns, useLaunchCampaign, usePauseCampaign } from "@/hooks/use-campaigns";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Campaigns() {
  const { data: campaigns, isLoading } = useCampaigns();
  const launchMutation = useLaunchCampaign();
  const pauseMutation = usePauseCampaign();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const handleToggleStatus = (id: number, currentStatus: string) => {
    if (currentStatus === "active") {
      pauseMutation.mutate(id, {
        onSuccess: () => toast({ title: "Campaign Paused" })
      });
    } else {
      launchMutation.mutate(id, {
        onSuccess: () => toast({ title: "Campaign Launched" })
      });
    }
  };

  // Mock data if api is empty
  const displayData = campaigns?.length ? campaigns : [
    { id: 1, name: "Q3 Enterprise SaaS Outline", type: "outbound", status: "active", sentCount: 1250, openCount: 600, replyCount: 45, meetingsBooked: 12, createdAt: "2024-05-12T10:00:00Z" },
    { id: 2, name: "Dormant Customers 2023", type: "reactivation", status: "paused", sentCount: 5000, openCount: 1200, replyCount: 150, meetingsBooked: 28, createdAt: "2024-04-01T10:00:00Z" },
    { id: 3, name: "Series B Founders", type: "outbound", status: "draft", sentCount: 0, openCount: 0, replyCount: 0, meetingsBooked: 0, createdAt: "2024-05-20T10:00:00Z" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <PageHeader 
        title="Campaigns" 
        description="Manage your active automated outbound and reactivation sequences."
      >
        <Button className="gap-2 bg-primary">
          <Megaphone className="w-4 h-4" /> Create Campaign
        </Button>
      </PageHeader>

      <div className="flex items-center justify-between mb-6">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search campaigns..." 
            className="pl-9 bg-card border-border/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/30 text-muted-foreground border-b border-border/50">
            <tr>
              <th className="px-6 py-4 font-medium">Campaign Name</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Type</th>
              <th className="px-6 py-4 font-medium">Sent</th>
              <th className="px-6 py-4 font-medium">Open Rate</th>
              <th className="px-6 py-4 font-medium">Reply Rate</th>
              <th className="px-6 py-4 font-medium">Meetings</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">Loading campaigns...</td>
              </tr>
            ) : (
              displayData.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">{campaign.name}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                      campaign.status === 'active' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                      campaign.status === 'paused' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                      'bg-muted text-muted-foreground border-border'
                    }`}>
                      {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground capitalize">{campaign.type}</td>
                  <td className="px-6 py-4">{(campaign.sentCount ?? 0).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    {(campaign.sentCount ?? 0) > 0 ? (((campaign.openCount ?? 0) / (campaign.sentCount ?? 0)) * 100).toFixed(1) + '%' : '-'}
                  </td>
                  <td className="px-6 py-4">
                    {(campaign.sentCount ?? 0) > 0 ? (((campaign.replyCount ?? 0) / (campaign.sentCount ?? 0)) * 100).toFixed(1) + '%' : '-'}
                  </td>
                  <td className="px-6 py-4 font-semibold text-foreground">{campaign.meetingsBooked}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-full"
                        onClick={() => handleToggleStatus(campaign.id, campaign.status)}
                        disabled={campaign.status === 'draft'}
                      >
                        {campaign.status === 'active' ? (
                          <Pause className="w-4 h-4 text-muted-foreground hover:text-yellow-600" />
                        ) : (
                          <Play className="w-4 h-4 text-muted-foreground hover:text-green-600" />
                        )}
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="cursor-pointer">
                            <ArrowUpRight className="mr-2 h-4 w-4" /> View Analytics
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer">Edit Sequence</DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
