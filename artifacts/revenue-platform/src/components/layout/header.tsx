import { Moon, Sun, Bell, User as UserIcon, LogOut, ChevronRight, PanelLeftOpen, PanelLeftClose, Menu, X } from "lucide-react";
import { useTheme } from "../theme-provider";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const routeLabels: Record<string, { section: string; label: string }> = {
  "/": { section: "Overview", label: "Dashboard" },
  "/outbound": { section: "AI Agents", label: "AI Outbound" },
  "/reactivation": { section: "AI Agents", label: "Reactivation" },
  "/conversion": { section: "AI Agents", label: "Conversion" },
  "/campaigns": { section: "Platform", label: "Campaigns" },
  "/analytics": { section: "Platform", label: "Analytics" },
  "/integrations": { section: "Platform", label: "Integrations" },
  "/settings": { section: "Platform", label: "Settings" },
};

export function Header({ onToggleSidebar, collapsed, mobileMenuOpen }: { onToggleSidebar?: () => void; collapsed?: boolean; mobileMenuOpen?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const breadcrumb = routeLabels[location] ?? { section: "Platform", label: "Page" };

  return (
    <header className="h-12 flex items-center justify-between px-3 md:px-4 bg-background border-b border-border sticky top-0 z-30">
      {/* Left — Toggle + Breadcrumb */}
      <div className="flex items-center gap-2">
        {/* Mobile: hamburger / close */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 md:hidden"
          onClick={onToggleSidebar}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen
            ? <X className="w-4 h-4" />
            : <Menu className="w-4 h-4" />}
        </Button>

        {/* Desktop: collapse / expand */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
          onClick={onToggleSidebar}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <PanelLeftOpen className="w-4 h-4" />
            : <PanelLeftClose className="w-4 h-4" />}
        </Button>

        <nav className="flex items-center gap-1.5 text-[13px] select-none">
          <span className="hidden sm:inline text-muted-foreground/60 font-medium">{breadcrumb.section}</span>
          <ChevronRight className="hidden sm:inline w-3.5 h-3.5 text-muted-foreground/35 shrink-0" />
          <span className="font-semibold text-foreground">{breadcrumb.label}</span>
        </nav>
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-0.5">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light"
            ? <Moon className="w-4 h-4" />
            : <Sun className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 relative"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
        </Button>

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-1 md:mx-1.5" />

        {/* User avatar */}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-8 w-8 rounded-md p-0 hover:bg-muted/60 transition-all"
              >
                <Avatar className="h-7 w-7 rounded-md">
                  <AvatarImage src={user.profileImageUrl || ""} alt={user.firstName || "User"} />
                  <AvatarFallback className="rounded-md bg-primary/15 text-primary text-xs font-semibold">
                    {user.firstName ? user.firstName[0] : <UserIcon className="w-3.5 h-3.5" />}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-semibold leading-none">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => logout()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}
