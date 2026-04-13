import { motion } from "framer-motion";
import { PageHeader } from "@/components/molecules/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useIntegrations, useUpdateIntegration } from "@/hooks/use-integrations";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Link as LinkIcon, AlertCircle } from "lucide-react";

export default function Integrations() {
  const { data, isLoading } = useIntegrations();
  const updateMutation = useUpdateIntegration();
  const { toast } = useToast();

  const handleConnect = (id: number) => {
    // In a real app this would open an OAuth modal or API key input dialog
    updateMutation.mutate({ id, data: { status: "connected" } }, {
      onSuccess: () => toast({ title: "Integration Connected" })
    });
  };

  const displayData = data || [];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <PageHeader 
        title="Integrations" 
        description="Connect your existing revenue stack to Agentic AI."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayData.map((integration) => (
          <Card key={integration.id} className="border-border/50 shadow-sm flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start mb-2">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-xl font-bold font-display text-primary">
                  {integration.name.charAt(0)}
                </div>
                {integration.status === "connected" ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    Disconnected
                  </span>
                )}
              </div>
              <CardTitle className="text-xl">{integration.name}</CardTitle>
              <CardDescription>{integration.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Category</div>
              <span className="inline-flex px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
                {integration.category}
              </span>
            </CardContent>
            <CardFooter className="pt-4 border-t border-border/50 mt-auto">
              <Button 
                variant={integration.status === "connected" ? "outline" : "default"} 
                className="w-full gap-2"
                onClick={() => handleConnect(integration.id)}
              >
                <LinkIcon className="w-4 h-4" />
                {integration.status === "connected" ? "Manage Settings" : "Connect"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}
