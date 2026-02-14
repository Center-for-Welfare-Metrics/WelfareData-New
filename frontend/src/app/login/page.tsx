"use client";

import { motion } from "framer-motion";
import { Activity, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <>
      <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/4 left-1/2 size-150 -translate-x-1/2 rounded-full bg-primary/3 blur-3xl" />
          <div className="absolute -bottom-1/4 right-0 size-100 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative w-full max-w-md"
        >
          <div className="rounded-xl border border-border/40 bg-card/80 p-8 backdrop-blur-sm">
            <div className="mb-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
                  <Activity className="size-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">WelfareData</h1>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    v1.0 — WFI/USP
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="size-4 text-primary/70" />
                  <span className="font-mono text-xs uppercase tracking-wider">
                    Autenticação Requerida
                  </span>
                </div>
                <div className="h-px bg-linear-to-r from-primary/40 via-primary/10 to-transparent" />
              </div>
            </div>

            <LoginForm />
          </div>

          <p className="mt-4 text-center text-[11px] font-mono text-muted-foreground/60">
            Centro de Métricas de Bem-Estar Animal — FMVZ/USP
          </p>
        </motion.div>
      </div>
    </>
  );
}
