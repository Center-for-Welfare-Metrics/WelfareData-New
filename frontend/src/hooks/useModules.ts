import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { moduleService } from "@/services/modules";

export const MODULES_KEY = ["production-modules"] as const;

export function useModules(specieId?: string) {
  return useQuery({
    queryKey: [...MODULES_KEY, specieId],
    queryFn: () => moduleService.getAll(specieId),
  });
}

export function useCreateModule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: moduleService.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MODULES_KEY });
      toast.success("Módulo criado com sucesso");
    },
    onError: (err: Error) => {
      toast.error("Falha ao criar módulo", {
        description: err.message || "Erro inesperado.",
      });
    },
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: moduleService.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MODULES_KEY });
      toast.success("Módulo removido");
    },
    onError: (err: Error) => {
      toast.error("Falha ao remover", {
        description: err.message || "Erro inesperado.",
      });
    },
  });
}
