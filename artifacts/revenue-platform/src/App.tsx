import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { ThemeProvider } from "@/components/theme-provider";
import { AppLayout } from "@/components/layout";

// Pages
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import AIOutbound from "@/pages/ai-outbound";
import Campaigns from "@/pages/campaigns";
import Integrations from "@/pages/integrations";

const queryClient = new QueryClient();

// Protected Route wrapper
function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <AppLayout>
      <Component {...rest} />
    </AppLayout>
  );
}

// Fallback pages for unwritten routes to show completeness
const PlaceholderPage = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 animate-in fade-in zoom-in duration-500">
    <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
      <span className="text-2xl font-bold text-muted-foreground">⚙️</span>
    </div>
    <h2 className="text-2xl font-display font-bold text-foreground">{title}</h2>
    <p className="text-muted-foreground max-w-md">This module is currently being provisioned by the Agentic AI platform core.</p>
  </div>
);

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/outbound" component={() => <ProtectedRoute component={AIOutbound} />} />
      <Route path="/campaigns" component={() => <ProtectedRoute component={Campaigns} />} />
      <Route path="/integrations" component={() => <ProtectedRoute component={Integrations} />} />
      
      {/* Placeholders for remaining sidebar routes to prevent 404s */}
      <Route path="/reactivation" component={() => <ProtectedRoute component={() => <PlaceholderPage title="CRM Reactivation Agent" />} />} />
      <Route path="/conversion" component={() => <ProtectedRoute component={() => <PlaceholderPage title="Website Conversion Agent" />} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={() => <PlaceholderPage title="Analytics & Attribution" />} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={() => <PlaceholderPage title="Workspace Settings" />} />} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="agentic-theme">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
