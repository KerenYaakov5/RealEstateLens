import type { CityListDto, CitySearchResultDto, NeighborhoodSearchResultDto } from '@rel/shared';
import { useQuery } from '@tanstack/react-query';
import type { AutocompleteOption } from '../components/Autocomplete';
import { getJson } from './client';

/**
 * Every official locality. Suggestions show names only – how many deals we have is shown once a
 * place is chosen (see fetchCityList).
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

export interface CityList {
  /** Deals per city we have data for (any other locality has none). */
  dealCounts: Map<number, number>;
  /** The budget slider's upper end, from the data; null if the server did not say. */
  budgetMax: number | null;
}

async function fetchCityList(signal: AbortSignal): Promise<CityList> {
  const body = await getJson<CityListDto>('/cities', signal);
  return {
    dealCounts: new Map((body?.data ?? []).map((city) => [city.id, city.dealCount] as const)),
    budgetMax: body?.meta.budgetMax ?? null,
  };
}

/** The city list changes only with the data; one fetch serves the whole app for a while. */
export function useCityList() {
  return useQuery({
    queryKey: ['cityList'],
    queryFn: ({ signal }) => {
      return fetchCityList(signal);
    },
    staleTime: 10 * 60_000,
  });
}

/** Neighborhoods we have deals for in one city (names only, like the city search). */
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
    };
  });
}
