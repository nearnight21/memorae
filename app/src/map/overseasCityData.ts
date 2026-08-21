import type { CityMapLabel, MapBounds } from '../../modules/expo-amap-map/src/ExpoAmapMap.types';
import { OVERSEAS_CITY_TUPLES } from './generated/overseasCityData';

export type OverseasCity = CityMapLabel;

const MAX_LABEL_CANDIDATES = 240;

export const OVERSEAS_CITY_DATASET_VERSION = 'geonames-cities15000-2026-04-13';

export const OVERSEAS_CITIES: readonly OverseasCity[] = OVERSEAS_CITY_TUPLES.map((city) => ({
  id: city[0],
  name: city[1],
  latitude: city[2],
  longitude: city[3],
  countryCode: city[4],
  population: city[5],
  capital: city[6] === 1,
}));

function populationThreshold(zoom: number): number {
  if (zoom < 5) return 1_000_000;
  if (zoom < 7) return 250_000;
  return 100_000;
}

function longitudeInBounds(longitude: number, bounds: MapBounds): boolean {
  const west = bounds.southWest.longitude;
  const east = bounds.northEast.longitude;
  if (west <= east) return longitude >= west && longitude <= east;
  return longitude >= west || longitude <= east;
}

export function selectVisibleOverseasCities(
  zoom: number,
  bounds: MapBounds,
): OverseasCity[] {
  const minimumPopulation = populationThreshold(zoom);
  return OVERSEAS_CITIES
    .filter((city) => (
      city.latitude >= bounds.southWest.latitude
      && city.latitude <= bounds.northEast.latitude
      && longitudeInBounds(city.longitude, bounds)
      && (city.capital || city.population >= minimumPopulation)
    ))
    .sort((left, right) => (
      Number(right.capital) - Number(left.capital)
      || right.population - left.population
      || left.id.localeCompare(right.id)
    ))
    .slice(0, MAX_LABEL_CANDIDATES);
}
