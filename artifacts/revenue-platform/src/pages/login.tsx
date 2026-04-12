import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Bot, ArrowRight, ShieldCheck, Zap, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen w-full flex bg-background overflow-hidden">
      {/* Left panel */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-20 xl:px-28 relative z-10">
        {/* Background ambient glows */}
        <div className="absolute top-1/3 left-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/3 w-48 h-48 bg-accent/8 rounded-full blur-3xl pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-md relative"
        >
          {/* Brand */}
          <div className="flex items-center gap-3 mb-10">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/40 rounded-xl blur-md" />
              <div className="relative gradient-primary p-2.5 rounded-xl shadow-lg">
                <Bot className="w-5 h-5 text-white" />
              </div>
            </div>
            <span className="font-display font-bold text-xl tracking-tight gradient-text">Advan AI</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-display font-extrabold tracking-tight text-foreground mb-5 leading-[1.1]">
            AI-Powered Growth<br />
            <span className="gradient-text">for Predictable Revenue</span>
          </h1>
          <p className="text-base text-muted-foreground mb-8 leading-relaxed">
            Deploy autonomous AI agents to source leads, reactivate CRM contacts, and convert website visitors into booked meetings.
          </p>

          <Button 
            onClick={login} 
            size="lg" 
            className="gradient-primary border-0 text-white text-sm h-11 px-7 rounded-xl shadow-lg shadow-primary/25 hover:opacity-90 hover:-translate-y-0.5 transition-all"
          >
            Sign in with Google
            <ArrowRight className="w-4 h-4" />
          </Button>

          <div className="mt-12 grid grid-cols-3 gap-5 pt-8 border-t border-border/40">
            {[
              { icon: Zap, label: "Autonomous Outbound", color: "text-primary" },
              { icon: ShieldCheck, label: "CRM Reactivation", color: "text-accent" },
              { icon: BarChart3, label: "Conversion Analytics", color: "text-cyan-500" },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="flex flex-col gap-2">
                <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className="text-xs font-medium text-foreground/80 leading-snug">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right panel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-muted/30 dark:bg-[hsl(228_38%_4%)]">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/12 via-transparent to-accent/8 z-10" />
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay"
        />

        <motion.div 
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="absolute top-1/4 left-1/4 glass border-border/30 p-5 rounded-2xl shadow-2xl z-20 w-68"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Bot className="w-4.5 h-4.5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">Outbound Agent</p>
              <p className="text-xs text-emerald-500 font-medium">Meeting Booked ✓</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="h-1.5 bg-muted rounded-full w-full" />
            <div className="h-1.5 bg-muted rounded-full w-4/5" />
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="absolute bottom-1/3 right-1/4 glass border-border/30 p-5 rounded-2xl shadow-2xl z-20 w-56"
        >
          <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">Pipeline Generated</p>
          <p className="text-3xl font-bold font-display gradient-text">$124,500</p>
          <p className="text-xs text-emerald-500 mt-1.5 font-semibold">↑ +14.2% this month</p>
        </motion.div>
      </div>
    </div>
  );
}
