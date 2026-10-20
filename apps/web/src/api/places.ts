import type { CityDto, CitySearchResultDto, NeighborhoodSearchResultDto } from '@rel/shared';
import type { AutocompleteOption } from '../components/Autocomplete';
import { getJson } from './client';

function dealsHint(dealCount: number, noDataText: string): string {
  return dealCount === 0 ? noDataText : `${dealCount.toLocaleString('he-IL')} עסקאות`;
}

/**
 * Every official locality. Suggestions show names only – how many deals we have is shown once a
 * place is chosen (see cityDealCounts).
 */
export async function searchCities(
  term: string,
  signal: AbortSignal,
): Promise<AutocompleteOption[]> {
  const body = await getJson<{ data: CitySearchResultDto[] }>(
    `/cities?search=${encodeURIComponent(term)}`,
    signal,
  );
  return (body?.data ?? []).map((city) => {
    return {
      id: city.id,
      label: city.name,
    };
  });
}

/** Deal counts of the cities we have deals in (any other locality has none). */
export async function cityDealCounts(signal: AbortSignal): Promise<Map<number, number>> {
  const body = await getJson<{ data: CityDto[] }>('/cities', signal);
  return new Map((body?.data ?? []).map((city) => [city.id, city.dealCount] as const));
}

/** Neighborhoods we have deals for in one city. */
export async function searchNeighborhoods(
  cityId: number,
  term: string,
  signal: AbortSignal,
): Promise<AutocompleteOption[]> {
  const body = await getJson<{ data: NeighborhoodSearchResultDto[] }>(
    `/cities/${cityId}/neighborhoods?search=${encodeURIComponent(term)}`,
    signal,
  );
  return (body?.data ?? []).map((neighborhood) => {
    return {
      id: neighborhood.id,
      label: neighborhood.name,
      hint: dealsHint(neighborhood.dealCount, ''),
    };
  });
}
