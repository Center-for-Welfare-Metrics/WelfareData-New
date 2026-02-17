import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { processogramService } from "@/services/processograms";

const QUERY_KEY = ["processograms"] as const;

export function useProcessograms() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: processogramService.getAll,
  });
}

export function useUploadProcessogram() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      meta,
    }: {
      file: File;
      meta: {
        name: string;
        specieId: string;
        productionModuleId: string;
        description?: string;
      };
    }) => processogramService.upload(file, meta),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Upload concluído", {
        description: "Processograma enviado. A análise será iniciada em breve.",
      });
    },
    onError: (err: Error) => {
      toast.error("Falha no upload", {
        description: err.message || "Erro inesperado ao enviar o arquivo.",
      });
    },
  });
}

export function useDeleteProcessogram() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: processogramService.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Processograma removido");
    },
    onError: (err: Error) => {
      toast.error("Falha ao remover", {
        description: err.message || "Erro inesperado.",
      });
    },
  });
}
