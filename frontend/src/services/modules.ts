import { api } from "@/lib/api";
import type { ProductionModule } from "@/types/productionModule";

export const moduleService = {
  async getAll(specieId?: string): Promise<ProductionModule[]> {
    const { data } = await api.get<ProductionModule[]>(
      "/production-modules",
      { params: specieId ? { specieId } : undefined }
    );
    return data;
  },

  async create(body: {
    name: string;
    specieId: string;
    description?: string;
  }): Promise<ProductionModule> {
    const { data } = await api.post<ProductionModule>(
      "/production-modules",
      body
    );
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/production-modules/${id}`);
  },
};
