import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { specieService } from "@/services/species";

export const SPECIES_KEY = ["species"] as const;

export function useSpecies() {
  return useQuery({
    queryKey: SPECIES_KEY,
    queryFn: specieService.getAll,
  });
}

export function useCreateSpecie() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: specieService.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SPECIES_KEY });
      toast.success("Espécie criada com sucesso");
    },
    onError: (err: Error) => {
      toast.error("Falha ao criar espécie", {
        description: err.message || "Erro inesperado.",
      });
    },
  });
}

export function useDeleteSpecie() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: specieService.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SPECIES_KEY });
      toast.success("Espécie removida");
    },
    onError: (err: Error) => {
      toast.error("Falha ao remover", {
        description: err.message || "Erro inesperado.",
      });
    },
  });
}
