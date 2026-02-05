export interface IProductionModule {
  name: string;
  slug: string;
  description?: string;
  specieId: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
}
