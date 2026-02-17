"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileUp, CheckCircle2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useUploadProcessogram } from "@/hooks/useProcessograms";
import { api } from "@/lib/api";
import type { Specie } from "@/types/specie";
import type { ProductionModule } from "@/types/productionModule";

interface UploadZoneProps {
  onComplete?: () => void;
}

type UploadStep = "idle" | "form" | "uploading" | "done" | "error";

export function UploadZone({ onComplete }: UploadZoneProps) {
  const [step, setStep] = useState<UploadStep>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [name, setName] = useState("");
  const [specieId, setSpecieId] = useState("");
  const [productionModuleId, setProductionModuleId] = useState("");

  const upload = useUploadProcessogram();

  const { data: species } = useQuery({
    queryKey: ["species"],
    queryFn: async () => {
      const { data } = await api.get<Specie[]>("/species");
      return data;
    },
  });

  const { data: modules } = useQuery({
    queryKey: ["production-modules", specieId],
    queryFn: async () => {
      const { data } = await api.get<ProductionModule[]>(
        "/production-modules",
        { params: { specieId } }
      );
      return data;
    },
    enabled: !!specieId,
  });

  const onDrop = useCallback((accepted: File[]) => {
    const svg = accepted[0];
    if (!svg) return;
    setFile(svg);
    setName(svg.name.replace(/\.svg$/i, ""));
    setStep("form");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/svg+xml": [".svg"] },
    maxFiles: 1,
    disabled: step === "uploading",
  });

  useEffect(() => {
    if (step !== "uploading") return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 92) {
          clearInterval(interval);
          return 92;
        }
        return p + Math.random() * 8;
      });
    }, 300);
    return () => clearInterval(interval);
  }, [step]);

  const handleSubmit = useCallback(async () => {
    if (!file || !name.trim() || !specieId || !productionModuleId) return;

    setStep("uploading");
    setProgress(0);

    try {
      await upload.mutateAsync({
        file,
        meta: { name: name.trim(), specieId, productionModuleId },
      });
      setProgress(100);
      setStep("done");
      setTimeout(() => {
        setStep("idle");
        setFile(null);
        setName("");
        setSpecieId("");
        setProductionModuleId("");
        onComplete?.();
      }, 1500);
    } catch {
      setStep("error");
      setTimeout(() => setStep("form"), 3000);
    }
  }, [file, name, specieId, productionModuleId, upload, onComplete]);

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {step === "idle" && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div
              {...getRootProps()}
              className={cn(
                "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-all duration-300",
                isDragActive
                  ? "border-primary bg-primary/10 shadow-[0_0_30px_oklch(0.637_0.237_25.331/0.15)]"
                  : "border-primary/30 bg-background/50 hover:border-primary/60 hover:bg-primary/5"
              )}
            >
              <input {...getInputProps()} />
              <motion.div
                animate={isDragActive ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={cn(
                  "flex size-14 items-center justify-center rounded-xl border transition-colors duration-300",
                  isDragActive
                    ? "border-primary/50 bg-primary/20 text-primary"
                    : "border-white/10 bg-white/5 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary"
                )}
              >
                {isDragActive ? (
                  <FileUp className="size-6" />
                ) : (
                  <Upload className="size-6" />
                )}
              </motion.div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {isDragActive ? "Solte o arquivo aqui" : "Arraste um SVG ou clique para selecionar"}
                </p>
                <p className="mt-1 text-xs font-mono text-muted-foreground">
                  Formato aceito: .svg
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {step === "form" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4 rounded-lg border border-primary/20 bg-black/40 p-5 backdrop-blur"
          >
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary">
              <FileUp className="size-3.5" />
              Configurar Upload
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-mono text-muted-foreground">
                  Nome
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
                  placeholder="Nome do processograma"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-mono text-muted-foreground">
                  Espécie
                </label>
                <select
                  value={specieId}
                  onChange={(e) => {
                    setSpecieId(e.target.value);
                    setProductionModuleId("");
                  }}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
                >
                  <option value="" className="bg-card">Selecione...</option>
                  {species?.map((s) => (
                    <option key={s._id} value={s._id} className="bg-card">
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-mono text-muted-foreground">
                  Módulo de Produção
                </label>
                <select
                  value={productionModuleId}
                  onChange={(e) => setProductionModuleId(e.target.value)}
                  disabled={!specieId}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50 disabled:opacity-40"
                >
                  <option value="" className="bg-card">
                    {specieId ? "Selecione..." : "Selecione a espécie primeiro"}
                  </option>
                  {modules?.map((m) => (
                    <option key={m._id} value={m._id} className="bg-card">
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => {
                  setStep("idle");
                  setFile(null);
                }}
                className="text-xs font-mono text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancelar
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSubmit}
                disabled={!name.trim() || !specieId || !productionModuleId}
                className={cn(
                  "rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-mono font-medium text-primary transition-colors",
                  "hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-30"
                )}
              >
                Iniciar Upload
              </motion.button>
            </div>
          </motion.div>
        )}

        {step === "uploading" && (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4 rounded-lg border border-primary/20 bg-black/40 p-6 backdrop-blur"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-widest text-primary">
                  Upload & Análise Biométrica
                </span>
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
            <p className="text-xs font-mono text-muted-foreground animate-pulse">
              Processando pipeline SVG → Rasterização → Upload GCS...
            </p>
          </motion.div>
        )}

        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6"
          >
            <CheckCircle2 className="size-8 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-300">
              Upload concluído com sucesso
            </p>
          </motion.div>
        )}

        {step === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-6"
          >
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Falha no upload — tente novamente
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
