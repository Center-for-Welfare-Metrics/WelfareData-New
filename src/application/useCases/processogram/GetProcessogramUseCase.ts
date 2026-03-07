import { ProcessogramModel } from '../../../infrastructure/models/ProcessogramModel';

/**
 * Converte um Mongoose Map (ou qualquer Map-like) para um plain object.
 * Necessário porque `JSON.stringify(new Map(...))` retorna `"{}"` —
 * o Map nativo do JS não é enumerável pelo serializer JSON.
 *
 * Se o valor já for um plain object (ex: documento sem o campo Map,
 * ou criado com `.lean()` em versões futuras do Mongoose que façam
 * a conversão automática), retorna-o sem alteração.
 */
function mapToRecord(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export class GetProcessogramUseCase {
  async execute(id: string) {
    const processogram = await ProcessogramModel.findById(id)
      .populate('specieId', 'name pathname')
      .populate('productionModuleId', 'name slug')
      .lean();

    if (!processogram) {
      throw new Error('Processogram not found');
    }

    // Mongoose `type: Map` fields são retornados como `Map` nativo pelo
    // driver MongoDB, mesmo com `.lean()`. `JSON.stringify(new Map())`
    // produz `"{}"`, o que faz os raster_images chegarem vazios ao frontend.
    // Conversão explícita para plain object garante serialização correcta.
    return {
      ...processogram,
      raster_images_light: mapToRecord(processogram.raster_images_light),
      raster_images_dark: mapToRecord(processogram.raster_images_dark),
    };
  }
}
