import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { ThemeProvider } from "@/components/theme-provider";
import { AppLayout } from "@/components/layout";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import AIOutbound from "@/pages/ai-outbound";
import Campaigns from "@/pages/campaigns";
import Integrations from "@/pages/integrations";
import Reactivation from "@/pages/reactivation";
import Conversion from "@/pages/conversion";
import Analytics from "@/pages/analytics";
import SettingsPage from "@/pages/settings";
import AuthCallbackPage from "@/pages/auth-callback";

// Stat detail pages
import ProspectsDetail from "@/pages/stats/prospects";
import EmailsSentDetail from "@/pages/stats/emails";
import ReplyRateDetail from "@/pages/stats/reply-rate";
import MeetingsDetail from "@/pages/stats/meetings";
import ReactivationsDetail from "@/pages/stats/reactivations";
import ConversionsDetail from "@/pages/stats/conversions";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType } & Record<string, unknown>) {
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

function Router() {
  return (
    <Switch>
      <Route path="/auth/google/callback" component={AuthCallbackPage} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/outbound" component={() => <ProtectedRoute component={AIOutbound} />} />
      <Route path="/campaigns" component={() => <ProtectedRoute component={Campaigns} />} />
      <Route path="/integrations" component={() => <ProtectedRoute component={Integrations} />} />
      <Route path="/reactivation" component={() => <ProtectedRoute component={Reactivation} />} />
      <Route path="/conversion" component={() => <ProtectedRoute component={Conversion} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={SettingsPage} />} />
      {/* Stat detail routes */}
      <Route path="/stats/prospects"    component={() => <ProtectedRoute component={ProspectsDetail}    />} />
      <Route path="/stats/emails"       component={() => <ProtectedRoute component={EmailsSentDetail}   />} />
      <Route path="/stats/reply-rate"   component={() => <ProtectedRoute component={ReplyRateDetail}    />} />
      <Route path="/stats/meetings"     component={() => <ProtectedRoute component={MeetingsDetail}     />} />
      <Route path="/stats/reactivations" component={() => <ProtectedRoute component={ReactivationsDetail} />} />
      <Route path="/stats/conversions"  component={() => <ProtectedRoute component={ConversionsDetail}  />} />
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
