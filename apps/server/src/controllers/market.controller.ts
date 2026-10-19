import { dealsQuerySchema } from '@rel/shared';
import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import type { MarketDataService } from '../services/marketData.service.js';
import { listCities, listNeighborhoods, searchDeals } from '../services/marketQueries.js';

const cityParamsSchema = z.object({ cityId: z.coerce.number().int().positive() });

// The data changes only on re-seed; a short private cache lets the browser reuse responses.
function cacheBriefly(res: Response): void {
  res.set('Cache-Control', 'private, max-age=60');
}

export class MarketController {
  constructor(private readonly marketData: MarketDataService) {}

  /** GET /cities */
  listCities: RequestHandler = async (_req, res) => {
    const market = await this.marketData.getMarket();
    cacheBriefly(res);
    res.json({ data: listCities(market) });
  };

  /** GET /cities/:cityId/neighborhoods */
  listNeighborhoods: RequestHandler = async (req, res) => {
    const params = cityParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw AppError.badRequest('מזהה עיר לא תקין');
    }
    const neighborhoods = listNeighborhoods(await this.marketData.getMarket(), params.data.cityId);
    if (neighborhoods === null) {
      throw AppError.notFound('העיר המבוקשת לא נמצאה');
    }
    cacheBriefly(res);
    res.json({ data: neighborhoods });
  };

  /** GET /deals */
  listDeals: RequestHandler = async (req, res) => {
    const query = dealsQuerySchema.parse(req.query);
    cacheBriefly(res);
    res.json(searchDeals(await this.marketData.getMarket(), query));
  };
}
