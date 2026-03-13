import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Bot, ArrowRight, ShieldCheck, Zap, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 xl:px-32 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md"
        >
          <div className="flex items-center gap-3 mb-12">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Agentic AI logo"
              className="w-12 h-12 rounded-xl shadow-lg"
            />
            <span className="font-display font-bold text-2xl tracking-tight text-foreground">
              Agentic AI
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-display font-extrabold tracking-tight text-foreground mb-6 leading-tight">AI-Powered Growth Systems for Predictable Revenue</h1>
          <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
            Deploy autonomous AI agents to source leads, reactivate CRM contacts, and convert website visitors into booked meetings.
          </p>

          <Button 
            onClick={login} 
            size="lg" 
            className="w-full sm:w-auto text-base h-14 px-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/25 hover:-translate-y-0.5 transition-all"
          >
            Sign in
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-10 border-t border-border/50">
            <div className="flex flex-col gap-2">
              <Zap className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm">Autonomous Outbound</h3>
            </div>
            <div className="flex flex-col gap-2">
              <ShieldCheck className="w-5 h-5 text-accent" />
              <h3 className="font-semibold text-sm">CRM Reactivation</h3>
            </div>
            <div className="flex flex-col gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold text-sm">Conversion Analytics</h3>
            </div>
          </div>
        </motion.div>
      </div>
      <div className="hidden lg:flex flex-1 relative bg-muted overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background z-10 opacity-60"></div>
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt="Abstract 3D Network"
          className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-overlay"
        />
        
        
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="absolute top-1/4 left-1/4 bg-card/80 backdrop-blur-xl border border-border/50 p-6 rounded-2xl shadow-2xl z-20 w-72"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Outbound Agent</p>
              <p className="text-xs text-muted-foreground">Meeting Booked</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-2 bg-secondary rounded-full w-full"></div>
            <div className="h-2 bg-secondary rounded-full w-4/5"></div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="absolute bottom-1/3 right-1/4 bg-card/80 backdrop-blur-xl border border-border/50 p-6 rounded-2xl shadow-2xl z-20 w-64"
        >
          <p className="text-sm text-muted-foreground mb-2">Pipeline Generated</p>
          <p className="text-3xl font-bold font-display text-foreground">$124,500</p>
          <p className="text-xs text-green-500 mt-2 font-medium">+14.2% this month</p>
        </motion.div>
      </div>
    </div>
  );
}
