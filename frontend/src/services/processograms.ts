import { api } from "@/lib/api";
import type { Processogram, ProcessogramElement, ProcessogramQuestion } from "@/types/processogram";

export const processogramService = {
  async getAll(): Promise<Processogram[]> {
    const { data } = await api.get<Processogram[]>("/processograms");
    return data;
  },

  async getById(id: string): Promise<Processogram> {
    const { data } = await api.get<Processogram>(`/processograms/${id}`);
    return data;
  },

  async getElementData(processogramId: string): Promise<ProcessogramElement[]> {
    const { data } = await api.get<ProcessogramElement[]>(
      `/processograms/${processogramId}/data/public`
    );
    return data;
  },

  async getQuestions(processogramId: string): Promise<ProcessogramQuestion[]> {
    const { data } = await api.get<ProcessogramQuestion[]>(
      `/processograms/${processogramId}/questions`
    );
    return data;
  },

  async upload(
    file: File,
    meta: {
      name: string;
      specieId: string;
      productionModuleId: string;
      description?: string;
    }
  ): Promise<Processogram> {
    const form = new FormData();
    form.append("file", file);
    form.append("name", meta.name);
    form.append("specieId", meta.specieId);
    form.append("productionModuleId", meta.productionModuleId);
    if (meta.description) form.append("description", meta.description);

    const { data } = await api.post<Processogram>("/processograms", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/processograms/${id}`);
  },
};
