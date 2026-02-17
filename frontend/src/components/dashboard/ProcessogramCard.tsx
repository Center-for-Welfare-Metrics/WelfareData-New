"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Trash2, Network, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteProcessogram } from "@/hooks/useProcessograms";
import type { Processogram, ProcessogramStatus } from "@/types/processogram";

interface ProcessogramCardProps {
  processogram: Processogram;
  index: number;
}

const STATUS_CONFIG: Record<
  ProcessogramStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  processing: {
    label: "Processando",
    className:
      "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20",
    pulse: true,
  },
  generating: {
    label: "Gerando",
    className:
      "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20",
    pulse: true,
  },
  ready: {
    label: "Pronto",
    className:
      "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20",
  },
  error: {
    label: "Erro",
    className:
      "border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/20",
  },
};

function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function ProcessogramCard({
  processogram,
  index,
}: ProcessogramCardProps) {
  const deleteMutation = useDeleteProcessogram();
  const [isHovered, setIsHovered] = useState(false);
  const status = STATUS_CONFIG[processogram.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card transition-colors duration-300",
        isHovered ? "border-primary/40" : "border-border/40"
      )}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors",
                isHovered
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-white/10 bg-white/5 text-muted-foreground"
              )}
            >
              <Network className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {processogram.name}
              </h3>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                ID: {shortId(processogram._id)}
              </p>
            </div>
          </div>

          <Badge
            variant="outline"
            className={cn(
              "shrink-0 text-[10px] font-mono uppercase",
              status.className
            )}
          >
            {status.pulse && (
              <span className="relative mr-1.5 flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-current" />
              </span>
            )}
            {status.label}
          </Badge>
        </div>

        {processogram.description && (
          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {processogram.description}
          </p>
        )}

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/60">
          <Clock className="size-3" />
          {formatDate(processogram.createdAt)}
        </div>
      </div>

      <div className="flex border-t border-border/30">
        <motion.a
          href={`/view/${processogram._id}`}
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-mono text-muted-foreground transition-colors hover:text-primary"
        >
          <ExternalLink className="size-3" />
          VIEW
        </motion.a>

        <div className="w-px bg-border/30" />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <motion.button
              whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
              className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-mono text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="size-3" />
              DELETE
            </motion.button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-destructive/20 bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
              <AlertDialogDescription>
                O processograma{" "}
                <span className="font-mono font-semibold text-foreground">
                  {processogram.name}
                </span>{" "}
                será permanentemente removido, incluindo todos os dados de
                análise e arquivos no storage.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/10 bg-white/5 text-foreground hover:bg-white/10">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate(processogram._id)}
                className="border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive/25"
              >
                {deleteMutation.isPending ? "Removendo..." : "Remover"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <motion.div
        animate={{ opacity: isHovered ? 1 : 0 }}
        className="pointer-events-none absolute -bottom-px -right-px size-24 rounded-tl-3xl bg-primary/5"
      />
    </motion.div>
  );
}
