import { api } from "@/lib/api";
import type { Specie } from "@/types/specie";

export const specieService = {
  async getAll(): Promise<Specie[]> {
    const { data } = await api.get<Specie[]>("/species");
    return data;
  },

  async create(body: { name: string; description?: string }): Promise<Specie> {
    const { data } = await api.post<Specie>("/species", body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/species/${id}`);
  },
};
