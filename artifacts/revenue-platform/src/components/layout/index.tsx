import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setMobileOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleSidebarToggle = () => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar — slide-in drawer */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 h-full md:hidden",
          "transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        ].join(" ")}
      >
        <Sidebar collapsed={false} onClose={() => setMobileOpen(false)} isMobile />
      </div>

      {/* Desktop sidebar — always in flex flow */}
      <div className="hidden md:flex flex-col h-full shrink-0">
        <Sidebar collapsed={collapsed} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          onToggleSidebar={handleSidebarToggle}
          collapsed={collapsed}
          mobileMenuOpen={mobileOpen}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-5 lg:p-6 xl:p-8">
          <div className="max-w-screen-2xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
