"use client";

import { motion } from "framer-motion";
import { Activity, Network, PawPrint, Boxes } from "lucide-react";
import { DashboardLayout } from "@/components/layout";
import { useProcessograms } from "@/hooks/useProcessograms";
import { useSpecies } from "@/hooks/useSpecies";
import { useModules } from "@/hooks/useModules";

export default function AdminDashboardPage() {
  const { data: processograms } = useProcessograms();
  const { data: species } = useSpecies();
  const { data: modules } = useModules();

  const stats = [
    {
      label: "Espécies",
      value: species?.length ?? "—",
      icon: PawPrint,
      href: "/admin/species",
    },
    {
      label: "Módulos",
      value: modules?.length ?? "—",
      icon: Boxes,
      href: "/admin/modules",
    },
    {
      label: "Processogramas",
      value: processograms?.length ?? "—",
      icon: Network,
      href: "/admin/processograms",
    },
    {
      label: "Status",
      value: "Online",
      icon: Activity,
      href: null,
    },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-2"
        >
          <h1 className="text-3xl font-bold tracking-tight">
            WelfareData{" "}
            <span className="font-mono text-lg text-primary">v1.0</span>
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            System Online — Centro de Métricas de Bem-Estar Animal
          </div>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            const Wrapper = stat.href ? "a" : "div";
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
              >
                <Wrapper
                  {...(stat.href ? { href: stat.href } : {})}
                  className="group relative block overflow-hidden rounded-lg border border-border/40 bg-card p-4 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {stat.label}
                    </span>
                    <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                  <p className="mt-2 text-2xl font-bold font-mono">
                    {stat.value}
                  </p>
                  <div className="pointer-events-none absolute -bottom-px -right-px size-16 rounded-tl-2xl bg-primary/5 transition-colors group-hover:bg-primary/10" />
                </Wrapper>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="rounded-lg border border-border/40 bg-card p-6"
        >
          <h2 className="text-lg font-semibold">Painel de Controle</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bem-vindo à plataforma WelfareData. Utilize a barra lateral para
            navegar entre os módulos do sistema. Crie primeiro as Espécies,
            depois os Módulos de Produção, e finalmente faça upload dos
            Processogramas.
          </p>
          <div className="mt-4 h-px bg-linear-to-r from-primary/50 via-primary/20 to-transparent" />
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
