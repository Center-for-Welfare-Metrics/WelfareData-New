"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  Plus,
  Loader2,
  AlertTriangle,
  ServerCrash,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout";
import { ProcessogramCard } from "@/components/dashboard/ProcessogramCard";
import { UploadZone } from "@/components/dashboard/UploadZone";
import { useProcessograms } from "@/hooks/useProcessograms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function ProcessogramsPage() {
  const { data: processograms, isLoading, isError } = useProcessograms();
  const [uploadOpen, setUploadOpen] = useState(false);

  const count = processograms?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-2xl font-bold tracking-tight">
              Processogramas
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground font-mono">
              {isLoading
                ? "Carregando registros..."
                : `${count} processograma${count !== 1 ? "s" : ""} registrado${count !== 1 ? "s" : ""}`}
            </p>
          </motion.div>

          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.15 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                  "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Novo Upload</span>
              </motion.button>
            </DialogTrigger>
            <DialogContent className="border-primary/20 bg-card sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-mono">
                  <Network className="size-4 text-primary" />
                  Upload de Processograma
                </DialogTitle>
              </DialogHeader>
              <UploadZone onComplete={() => setUploadOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        <AnimatePresence mode="wait">
          {isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-4 py-20"
            >
              <Loader2 className="size-8 animate-spin text-primary/60" />
              <span className="text-sm font-mono text-muted-foreground">
                Carregando processogramas...
              </span>
            </motion.div>
          )}

          {isError && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-4 py-20"
            >
              <div className="flex size-16 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
                <AlertTriangle className="size-7 text-destructive" />
              </div>
              <p className="text-sm text-muted-foreground">
                Erro ao carregar processogramas.
              </p>
            </motion.div>
          )}

          {!isLoading && !isError && count === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-5 py-20"
            >
              <div className="relative">
                <div className="flex size-20 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5">
                  <ServerCrash className="size-9 text-primary/40" />
                </div>
                <motion.div
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute -inset-3 -z-10 rounded-3xl bg-primary/5 blur-xl"
                />
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  Nenhum processograma registrado
                </p>
                <p className="text-xs font-mono text-muted-foreground max-w-xs">
                  Faça upload de um arquivo SVG para iniciar o pipeline de
                  processamento e análise.
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setUploadOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-mono text-primary transition-colors hover:bg-primary/20"
              >
                <Plus className="size-4" />
                Primeiro Upload
              </motion.button>
            </motion.div>
          )}

          {!isLoading && !isError && count > 0 && (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {processograms!.map((p, i) => (
                <ProcessogramCard
                  key={p._id}
                  processogram={p}
                  index={i}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
