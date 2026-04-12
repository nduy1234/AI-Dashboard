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
  Bot,
  Zap,
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

const navSections = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    label: "AI Agents",
    items: [
      { name: "AI Outbound", href: "/outbound", icon: Send },
      { name: "Reactivation", href: "/reactivation", icon: RefreshCcw },
      { name: "Conversion", href: "/conversion", icon: MessageSquare },
    ],
  },
  {
    label: "Platform",
    items: [
      { name: "Campaigns", href: "/campaigns", icon: Megaphone },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Integrations", href: "/integrations", icon: Blocks },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar({ collapsed = false, onClose, isMobile = false }: SidebarProps) {
  const [location] = useLocation();

  return (
    <div className={cn(
      "flex h-full flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 ease-in-out shrink-0",
      collapsed && !isMobile ? "w-14" : "w-64 md:w-60"
    )}>
      {/* Workspace Switcher */}
      <div className="flex h-14 shrink-0 items-center px-3 border-b border-sidebar-border">
        {isMobile && (
          <button
            onClick={onClose}
            className="mr-2 flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors shrink-0"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button className={cn(
          "flex items-center hover:bg-sidebar-accent rounded-md px-2 py-1.5 transition-colors group w-full",
          collapsed && !isMobile ? "justify-center px-1" : "gap-2.5"
        )}>
          <div className="w-7 h-7 gradient-primary rounded-lg flex items-center justify-center shrink-0 shadow-sm">
            <Bot className="w-3.5 h-3.5 text-white" />
          </div>
          {(!collapsed || isMobile) && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="text-[13px] font-semibold text-sidebar-foreground truncate leading-none">Agentic AI</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-none">Revenue Platform</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 group-hover:text-muted-foreground transition-colors" />
            </>
          )}
        </button>
      </div>

      {/* Navigation */}
      <div className={cn("flex-1 overflow-y-auto py-3 space-y-4", collapsed && !isMobile ? "px-1.5" : "px-2")}>
        {navSections.map((section) => (
          <div key={section.label}>
            {(!collapsed || isMobile) && (
              <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 select-none">
                {section.label}
              </p>
            )}
            {collapsed && !isMobile && <div className="h-px bg-sidebar-border/50 mx-1 mb-2" />}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));

                return (
                  <Link key={item.name} href={item.href} className="block">
                    <div
                      title={collapsed && !isMobile ? item.name : undefined}
                      className={cn(
                        "relative flex items-center rounded-md text-[13px] font-medium transition-all duration-150 cursor-pointer select-none",
                        collapsed && !isMobile ? "justify-center p-2" : "gap-2.5 px-2.5 py-[7px]",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      )}
                    >
                      {/* Active left accent bar */}
                      {isActive && !collapsed && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                      )}
                      {isActive && collapsed && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                      )}

                      <item.icon className={cn(
                        "shrink-0 transition-colors",
                        collapsed && !isMobile ? "w-4.5 h-4.5" : "w-4 h-4",
                        isActive ? "text-primary" : "text-muted-foreground/50"
                      )} />

                      {(!collapsed || isMobile) && <span className="flex-1 truncate">{item.name}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Agent Status Footer */}
      <div className="border-t border-sidebar-border px-3 py-3">
        {(!collapsed || isMobile) ? (
          <>
            <div className="flex items-center gap-2.5 px-1">
              <div className="flex -space-x-1.5 shrink-0">
                {[
                  "bg-violet-500",
                  "bg-blue-500",
                  "bg-emerald-500",
                ].map((color, i) => (
                  <div key={i} className={cn(
                    "w-5 h-5 rounded-full border-2 border-sidebar flex items-center justify-center",
                    color
                  )}>
                    <Zap className="w-2.5 h-2.5 text-white" />
                  </div>
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-sidebar-foreground/70 truncate">3 agents running</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]" />
                <span className="text-[10px] font-semibold text-emerald-400">Live</span>
              </div>
            </div>
            <div className="mt-2 px-1">
              <button className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded-md text-[11px] text-muted-foreground hover:bg-sidebar-accent transition-colors group">
                <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="group-hover:text-sidebar-foreground transition-colors">Upgrade to Pro</span>
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div title="3 agents running — Live" className="relative flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 cursor-default">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]" />
            </div>
            <button title="Upgrade to Pro" className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-sidebar-accent transition-colors">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

