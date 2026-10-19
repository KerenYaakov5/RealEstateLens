import {
  dealsQuerySchema,
  placeSearchQuerySchema,
  type CitySearchResultDto,
  type NeighborhoodSearchResultDto,
} from '@rel/shared';
import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import type { MarketDataService } from '../services/marketData.service.js';
import { listCities, listNeighborhoods, searchDeals } from '../services/marketQueries.js';
import { searchCities, searchNeighborhoods } from '../services/search/placeSearch.js';

const cityParamsSchema = z.object({ cityId: z.coerce.number().int().positive() });

// The data changes only on re-seed; a short private cache lets the browser reuse responses.
function cacheBriefly(res: Response): void {
  res.set('Cache-Control', 'private, max-age=60');
}

function parseSearch(query: unknown): string | undefined {
  const parsed = placeSearchQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw AppError.badRequest('יש להקליד לפחות 3 תווים לחיפוש (ועד 100)');
  }
  return parsed.data.search;
}

export class MarketController {
  constructor(private readonly marketData: MarketDataService) {}

  /** GET /cities – cities with deals; with ?search= every official locality. */
  listCities: RequestHandler = async (req, res) => {
    const search = parseSearch(req.query);
    const market = await this.marketData.getMarket();
    if (search === undefined) {
      cacheBriefly(res);
      res.json({ data: listCities(market) });
      return;
    }
    const hits = searchCities(market, search);
    if (hits.length === 0) {
      res.status(204).end();
      return;
    }
    cacheBriefly(res);
    res.json({
      data: hits.map((hit): CitySearchResultDto => {
        return {
          id: hit.city.id,
          name: hit.city.nameHe,
          nameEn: hit.city.nameEn,
          dealCount: hit.dealCount,
          hasOfficialLocation: hit.city.location !== null,
          match: hit.match.kind,
        };
      }),
    });
  };

  /** GET /cities/:cityId/neighborhoods – neighborhoods we have deals for; ?search= filters. */
  listNeighborhoods: RequestHandler = async (req, res) => {
    const params = cityParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw AppError.badRequest('מזהה עיר לא תקין');
    }
    const search = parseSearch(req.query);
    const market = await this.marketData.getMarket();
    const all = listNeighborhoods(market, params.data.cityId);
    if (all === null) {
      throw AppError.notFound('העיר המבוקשת לא נמצאה');
    }
    if (search === undefined) {
      if (all.length === 0) {
        res.status(204).end();
        return;
      }
      cacheBriefly(res);
      res.json({ data: all });
      return;
    }
    const city = market.indexes.citiesById.get(params.data.cityId);
    const hits = city === undefined ? [] : searchNeighborhoods(market, city.key, search);
    if (hits.length === 0) {
      res.status(204).end();
      return;
    }
    cacheBriefly(res);
    res.json({
      data: hits.map((hit): NeighborhoodSearchResultDto => {
        return {
          id: hit.neighborhood.id,
          name: hit.neighborhood.name,
          dealCount: hit.dealCount,
          match: hit.match.kind,
        };
      }),
    });
  };

  /** GET /deals */
  listDeals: RequestHandler = async (req, res) => {
    const query = dealsQuerySchema.parse(req.query);
    cacheBriefly(res);
    res.json(searchDeals(await this.marketData.getMarket(), query));
  };
}
