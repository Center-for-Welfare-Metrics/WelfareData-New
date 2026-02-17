"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PawPrint,
  Plus,
  Loader2,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { DashboardLayout } from "@/components/layout";
import { useSpecies, useCreateSpecie, useDeleteSpecie } from "@/hooks/useSpecies";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const specieSchema = z.object({
  name: z.string().min(2, "Nome deve ter ao menos 2 caracteres"),
  description: z.string().optional(),
});

type SpecieForm = z.infer<typeof specieSchema>;

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default function SpeciesPage() {
  const { data: species, isLoading, isError } = useSpecies();
  const createMutation = useCreateSpecie();
  const deleteMutation = useDeleteSpecie();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<SpecieForm>({
    resolver: zodResolver(specieSchema),
    defaultValues: { name: "", description: "" },
  });

  const onSubmit = async (data: SpecieForm) => {
    await createMutation.mutateAsync(data);
    form.reset();
    setDialogOpen(false);
  };

  const count = species?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-2xl font-bold tracking-tight">Espécies</h1>
            <p className="mt-0.5 text-sm text-muted-foreground font-mono">
              {isLoading
                ? "Carregando..."
                : `${count} espécie${count !== 1 ? "s" : ""} registrada${count !== 1 ? "s" : ""}`}
            </p>
          </motion.div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                <span className="hidden sm:inline">Nova Espécie</span>
              </motion.button>
            </DialogTrigger>
            <DialogContent className="border-primary/20 bg-card sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-mono">
                  <PawPrint className="size-4 text-primary" />
                  Nova Espécie
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-mono text-muted-foreground">
                    Nome
                  </label>
                  <input
                    {...form.register("name")}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
                    placeholder="Ex: Suínos"
                  />
                  {form.formState.errors.name && (
                    <p className="mt-1 text-xs text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-mono text-muted-foreground">
                    Descrição (opcional)
                  </label>
                  <input
                    {...form.register("description")}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
                    placeholder="Descrição da espécie"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDialogOpen(false)}
                    className="rounded-md px-4 py-2 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Cancelar
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={createMutation.isPending}
                    className={cn(
                      "rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-mono font-medium text-primary transition-colors",
                      "hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    {createMutation.isPending ? "Criando..." : "Criar"}
                  </motion.button>
                </div>
              </form>
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
                Carregando espécies...
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
                Erro ao carregar espécies.
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
              <div className="flex size-16 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5">
                <PawPrint className="size-7 text-primary/40" />
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  Nenhuma espécie cadastrada
                </p>
                <p className="text-xs font-mono text-muted-foreground">
                  Crie a primeira espécie para começar a organizar os módulos.
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setDialogOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-mono text-primary transition-colors hover:bg-primary/20"
              >
                <Plus className="size-4" />
                Primeira Espécie
              </motion.button>
            </motion.div>
          )}

          {!isLoading && !isError && count > 0 && (
            <motion.div
              key="table"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-lg border border-border/40 bg-card overflow-hidden"
            >
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      Nome
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      Pathname
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      Criado em
                    </TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {species!.map((s, i) => (
                    <motion.tr
                      key={s._id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.04 }}
                      className="border-border/20 transition-colors hover:bg-white/[0.02]"
                    >
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {s.pathname}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(s.createdAt)}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="flex size-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                              <Trash2 className="size-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="border-destructive/20 bg-card">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Remover Espécie
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                A espécie{" "}
                                <span className="font-mono font-semibold text-foreground">
                                  {s.name}
                                </span>{" "}
                                será removida permanentemente, junto com todos os
                                módulos e processogramas vinculados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-white/10 bg-white/5 text-foreground hover:bg-white/10">
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(s._id)}
                                className="border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive/25"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
