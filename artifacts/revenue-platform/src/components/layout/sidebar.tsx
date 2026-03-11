import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Send, 
  RefreshCcw, 
  MessageSquare, 
  Megaphone, 
  BarChart3, 
  Blocks, 
  Settings,
  Bot
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "AI Outbound", href: "/outbound", icon: Send },
  { name: "AI Reactivation", href: "/reactivation", icon: RefreshCcw },
  { name: "AI Conversion", href: "/conversion", icon: MessageSquare },
  { name: "Campaigns", href: "/campaigns", icon: Megaphone },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Integrations", href: "/integrations", icon: Blocks },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r border-border/50">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-primary to-accent p-1.5 rounded-lg shadow-lg shadow-primary/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Agentic AI
          </span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        {navigation.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          
          return (
            <Link key={item.name} href={item.href} className="block">
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group cursor-pointer",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon 
                  className={cn(
                    "w-5 h-5 transition-colors", 
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )} 
                />
                {item.name}
              </div>
            </Link>
          );
        })}
      </div>
      
      <div className="p-4 border-t border-border/50">
        <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl p-4 border border-primary/20">
          <p className="text-xs font-semibold text-primary mb-1">Agent Status</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            3 Agents Active
          </div>
        </div>
      </div>
    </div>
  );
}
