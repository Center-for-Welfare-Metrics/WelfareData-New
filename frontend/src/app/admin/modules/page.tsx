"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Boxes,
  Plus,
  Loader2,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { DashboardLayout } from "@/components/layout";
import { useSpecies } from "@/hooks/useSpecies";
import { useModules, useCreateModule, useDeleteModule } from "@/hooks/useModules";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const moduleSchema = z.object({
  name: z.string().min(2, "Nome deve ter ao menos 2 caracteres"),
  specieId: z.string().min(1, "Selecione uma espécie"),
  description: z.string().optional(),
});

type ModuleForm = z.infer<typeof moduleSchema>;

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default function ModulesPage() {
  const [filterSpecieId, setFilterSpecieId] = useState<string>("");
  const { data: species } = useSpecies();
  const {
    data: modules,
    isLoading,
    isError,
  } = useModules(filterSpecieId || undefined);
  const createMutation = useCreateModule();
  const deleteMutation = useDeleteModule();
  const [dialogOpen, setDialogOpen] = useState(false);

  const form = useForm<ModuleForm>({
    resolver: zodResolver(moduleSchema),
    defaultValues: { name: "", specieId: "", description: "" },
  });

  const onSubmit = async (data: ModuleForm) => {
    await createMutation.mutateAsync(data);
    form.reset();
    setDialogOpen(false);
  };

  const speciesMap = new Map(species?.map((s) => [s._id, s.name]));
  const count = modules?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-2xl font-bold tracking-tight">
              Módulos de Produção
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground font-mono">
              {isLoading
                ? "Carregando..."
                : `${count} módulo${count !== 1 ? "s" : ""} registrado${count !== 1 ? "s" : ""}`}
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
                <span className="hidden sm:inline">Novo Módulo</span>
              </motion.button>
            </DialogTrigger>
            <DialogContent className="border-primary/20 bg-card sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-mono">
                  <Boxes className="size-4 text-primary" />
                  Novo Módulo de Produção
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1 block text-xs font-mono text-muted-foreground">
                    Espécie
                  </label>
                  <select
                    {...form.register("specieId")}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
                  >
                    <option value="" className="bg-card">
                      Selecione...
                    </option>
                    {species?.map((s) => (
                      <option key={s._id} value={s._id} className="bg-card">
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.specieId && (
                    <p className="mt-1 text-xs text-destructive">
                      {form.formState.errors.specieId.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-mono text-muted-foreground">
                    Nome
                  </label>
                  <input
                    {...form.register("name")}
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
                    placeholder="Ex: Maternidade"
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
                    placeholder="Descrição do módulo"
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

        {species && species.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <span className="text-xs font-mono text-muted-foreground">
              Filtrar:
            </span>
            <button
              onClick={() => setFilterSpecieId("")}
              className={cn(
                "rounded-md border px-3 py-1 text-xs font-mono transition-colors",
                !filterSpecieId
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
              )}
            >
              Todos
            </button>
            {species.map((s) => (
              <button
                key={s._id}
                onClick={() =>
                  setFilterSpecieId(filterSpecieId === s._id ? "" : s._id)
                }
                className={cn(
                  "rounded-md border px-3 py-1 text-xs font-mono transition-colors",
                  filterSpecieId === s._id
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                )}
              >
                {s.name}
              </button>
            ))}
          </motion.div>
        )}

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
                Carregando módulos...
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
                Erro ao carregar módulos.
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
                <Boxes className="size-7 text-primary/40" />
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  Nenhum módulo cadastrado
                </p>
                <p className="text-xs font-mono text-muted-foreground">
                  {species?.length
                    ? "Crie um módulo de produção para uma espécie existente."
                    : "Cadastre uma espécie primeiro em Espécies → Nova Espécie."}
                </p>
              </div>
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
                      Espécie
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      Slug
                    </TableHead>
                    <TableHead className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                      Criado em
                    </TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modules!.map((m, i) => (
                    <motion.tr
                      key={m._id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.04 }}
                      className="border-border/20 transition-colors hover:bg-white/[0.02]"
                    >
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-primary/20 bg-primary/5 text-primary"
                        >
                          {speciesMap.get(m.specieId) ?? m.specieId}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {m.slug}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(m.createdAt)}
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
                                Remover Módulo
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                O módulo{" "}
                                <span className="font-mono font-semibold text-foreground">
                                  {m.name}
                                </span>{" "}
                                será removido permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-white/10 bg-white/5 text-foreground hover:bg-white/10">
                                Cancelar
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(m._id)}
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
