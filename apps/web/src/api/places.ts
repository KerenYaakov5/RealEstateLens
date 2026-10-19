import type { CitySearchResultDto, NeighborhoodSearchResultDto } from '@rel/shared';
import type { AutocompleteOption } from '../components/Autocomplete';
import { getJson } from './client';

function dealsHint(dealCount: number, noDataText: string): string {
  return dealCount === 0 ? noDataText : `${dealCount.toLocaleString('he-IL')} עסקאות`;
}

/** Every official locality; places without deals are still offered, marked as such. */
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
      hint: dealsHint(city.dealCount, 'אין לנו עסקאות ביישוב הזה'),
    };
  });
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
