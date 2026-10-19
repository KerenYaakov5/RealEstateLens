import { Router } from 'express';
import type { MarketController } from '../controllers/market.controller.js';

export function createCityRouter(controller: MarketController): Router {
  const router = Router();
  router.get('/', controller.listCities);
  router.get('/:cityId/neighborhoods', controller.listNeighborhoods);
  return router;
}

export function createDealRouter(controller: MarketController): Router {
  const router = Router();
  router.get('/', controller.listDeals);
  return router;
}
