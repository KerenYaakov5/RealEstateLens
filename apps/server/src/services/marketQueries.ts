import type { CityDto, DealDto, DealsQuery, NeighborhoodDto, Page } from '@rel/shared';
import type { PricedMarket } from './assessment/market.js';
import { neighborhoodKey, type PricedDeal } from './assessment/types.js';

// Read-only queries over the in-memory market snapshot (no DB access per request).

/** Cities where we have deals (the full list of localities is reachable through search). */
export function listCities(market: PricedMarket): CityDto[] {
  const counts = market.indexes.dealCountByCity;
  return [...market.cities.values()]
    .filter((city) => {
      return counts.has(city.key);
    })
    .map((city): CityDto => {
      return {
        id: city.id,
        name: city.nameHe,
        nameEn: city.nameEn,
        dealCount: counts.get(city.key) ?? 0,
        hasOfficialLocation: city.location !== null,
      };
    })
    .sort((a, b) => {
      return a.name.localeCompare(b.name, 'he');
    });
}

/** Neighborhoods of a city with their deal counts, or null when the city does not exist. */
export function listNeighborhoods(market: PricedMarket, cityId: number): NeighborhoodDto[] | null {
  const city = market.indexes.citiesById.get(cityId);
  if (city === undefined) {
    return null;
  }
  const counts = market.indexes.dealCountByNeighborhood;
  return market.neighborhoods
    .filter((neighborhood) => {
      return neighborhood.cityKey === city.key;
    })
    .map((neighborhood): NeighborhoodDto => {
      return {
        id: neighborhood.id,
        name: neighborhood.name,
        dealCount: counts.get(neighborhoodKey(city.key, neighborhood.name)) ?? 0,
      };
    })
    .sort((a, b) => {
      return a.name.localeCompare(b.name, 'he');
    });
}

function pricePerSqm(deal: PricedDeal): number | null {
  return deal.sizeSqm === null || deal.sizeSqm === 0
    ? null
    : Math.round(deal.priceNis / deal.sizeSqm);
}

/** A filter on a value the deal does not state cannot be confirmed, so the deal is excluded. */
function inRange(value: number | null, min: number | undefined, max: number | undefined): boolean {
  if (min === undefined && max === undefined) {
    return true;
  }
  if (value === null) {
    return false;
  }
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function matchesFlag(value: boolean | null, wanted: boolean | undefined): boolean {
  return wanted === undefined || value === wanted;
}

function compareNullable(a: number | string | null, b: number | string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}

/** Converts in-memory deals to the API shape (shared by /deals and /market-assessments). */
export function createDealMapper(market: PricedMarket): (deal: PricedDeal) => DealDto {
  const neighborhoodIds = market.indexes.neighborhoodIdByKey;
  return (deal) => {
    const city = market.cities.get(deal.cityKey);
    if (city === undefined) {
      // Deals are loaded joined with their city, so this means a broken snapshot – never invent one.
      throw new Error(`Deal ${deal.dealId} refers to unknown city ${deal.cityKey}`);
    }
    const neighborhoodId =
      deal.neighborhood === null
        ? undefined
        : neighborhoodIds.get(neighborhoodKey(deal.cityKey, deal.neighborhood));
    return {
      id: deal.id,
      dealId: deal.dealId,
      city: { id: city.id, name: city.nameHe },
      neighborhood:
        deal.neighborhood === null || neighborhoodId === undefined
          ? null
          : { id: neighborhoodId, name: deal.neighborhood },
      street: deal.street,
      propertyType: deal.propertyType,
      rooms: deal.rooms,
      sizeSqm: deal.sizeSqm,
      floor: deal.floor,
      totalFloors: deal.totalFloors,
      yearBuilt: deal.yearBuilt,
      condition: deal.condition,
      features: { ...deal.features },
      dealDate: deal.dealDate,
      priceNis: deal.priceNis,
      adjustedPriceNis: deal.adjustedPrice,
      isAdjusted: deal.isAdjusted,
      pricePerSqm: pricePerSqm(deal),
      source: deal.source,
    };
  };
}

export function searchDeals(market: PricedMarket, query: DealsQuery): Page<DealDto> {
  const { citiesById, neighborhoodsById } = market.indexes;
  const cityKey =
    query.cityId === undefined ? undefined : (citiesById.get(query.cityId)?.key ?? null);
  const neighborhood =
    query.neighborhoodId === undefined
      ? undefined
      : (neighborhoodsById.get(query.neighborhoodId) ?? null);
  // An unknown city or neighborhood filter matches nothing (200 with an empty page).
  const unknownFilter = cityKey === null || neighborhood === null;

  const matching = unknownFilter
    ? []
    : market.deals.filter((deal) => {
        return (
          (cityKey === undefined || deal.cityKey === cityKey) &&
          (neighborhood === undefined ||
            (deal.cityKey === neighborhood.cityKey && deal.neighborhood === neighborhood.name)) &&
          (query.propertyType === undefined || query.propertyType.includes(deal.propertyType)) &&
          (query.condition === undefined ||
            (deal.condition !== null && query.condition.includes(deal.condition))) &&
          (query.source === undefined || query.source.includes(deal.source)) &&
          inRange(deal.rooms, query.minRooms, query.maxRooms) &&
          inRange(deal.sizeSqm, query.minSize, query.maxSize) &&
          inRange(deal.priceNis, query.minPrice, query.maxPrice) &&
          inRange(deal.floor, query.minFloor, query.maxFloor) &&
          inRange(deal.yearBuilt, query.minYearBuilt, undefined) &&
          matchesFlag(deal.features.safeRoom, query.hasSafeRoom) &&
          matchesFlag(deal.features.elevator, query.hasElevator) &&
          matchesFlag(deal.features.parking, query.hasParking) &&
          matchesFlag(deal.features.balcony, query.hasBalcony) &&
          (query.fromDate === undefined ||
            (deal.dealDate !== null && deal.dealDate >= query.fromDate)) &&
          (query.toDate === undefined || (deal.dealDate !== null && deal.dealDate <= query.toDate))
        );
      });

  const sortValue = (deal: PricedDeal): number | string | null => {
    switch (query.sortBy) {
      case 'price':
        return deal.priceNis;
      case 'pricePerSqm':
        return pricePerSqm(deal);
      case 'size':
        return deal.sizeSqm;
      case 'dealDate':
        return deal.dealDate;
    }
  };
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const sorted = [...matching].sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    // Missing values always go last, whatever the direction.
    if (va === null || vb === null) {
      return compareNullable(va, vb) || a.id - b.id;
    }
    return direction * compareNullable(va, vb) || a.id - b.id;
  });

  const totalItems = sorted.length;
  const start = (query.page - 1) * query.pageSize;
  const toDto = createDealMapper(market);
  const data = sorted.slice(start, start + query.pageSize).map(toDto);

  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}
