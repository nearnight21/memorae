import type {
  CityMapLabel,
  LatLng,
  MapBounds,
} from '../../modules/expo-amap-map/src/ExpoAmapMap.types';
import { OVERSEAS_CITY_TUPLES } from './generated/overseasCityData';
import { OVERSEAS_CITY_NAMES_ZH } from './overseasCityNamesZh';

export interface OverseasCity extends CityMapLabel {
  sourceName: string;
}

export type OverseasCityLabelContext = {
  kind: 'memory' | 'location-picker';
  target: LatLng;
};

// Labels belong to the city layer. Country and region views stay uncluttered.
export const CITY_LABEL_MIN_ZOOM = 8;

export const OVERSEAS_CITY_DATASET_VERSION = 'geonames-cities15000-2026-04-13';
export const OVERSEAS_CITY_SOURCE_COUNT = OVERSEAS_CITY_TUPLES.length;

export const OVERSEAS_CITIES: readonly OverseasCity[] = OVERSEAS_CITY_TUPLES.flatMap((city) => {
  const displayName = OVERSEAS_CITY_NAMES_ZH[city[0]] ?? city[1];
  return [{
    id: city[0],
    name: displayName,
    sourceName: city[1],
    latitude: city[2],
    longitude: city[3],
    countryCode: city[4],
    population: city[5],
    capital: city[6] === 1,
  }];
});

function populationThreshold(zoom: number, context: OverseasCityLabelContext): number {
  if (zoom < 9.5) return context.kind === 'location-picker' ? 250_000 : 1_000_000;
  if (zoom < 11) return context.kind === 'location-picker' ? 100_000 : 250_000;
  return 100_000;
}

function maximumDistanceKm(zoom: number): number {
  if (zoom < 9.5) return 650;
  if (zoom < 11) return 350;
  return 180;
}

function distanceKm(left: LatLng, right: LatLng): number {
  const latitudeRadians = ((left.latitude + right.latitude) / 2) * Math.PI / 180;
  const latitudeKm = (left.latitude - right.latitude) * 111.32;
  const longitudeKm = (left.longitude - right.longitude) * 111.32 * Math.cos(latitudeRadians);
  return Math.hypot(latitudeKm, longitudeKm);
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
  context: OverseasCityLabelContext | null,
): OverseasCity[] {
  if (!context || zoom < CITY_LABEL_MIN_ZOOM) return [];
  const minimumPopulation = populationThreshold(zoom, context);
  const maximumDistance = maximumDistanceKm(zoom);
  const maximumCandidates = context.kind === 'location-picker' ? 120 : 96;
  return OVERSEAS_CITIES
    .map((city) => ({ city, distance: distanceKm(city, context.target) }))
    .filter(({ city, distance }) => {
      const targetAnchor = distance <= 40;
      return city.latitude >= bounds.southWest.latitude
        && city.latitude <= bounds.northEast.latitude
        && longitudeInBounds(city.longitude, bounds)
        && distance <= maximumDistance
        && (targetAnchor || city.capital || city.population >= minimumPopulation);
    })
    .sort((left, right) => {
      const leftIsTarget = left.distance <= 40;
      const rightIsTarget = right.distance <= 40;
      return Number(rightIsTarget) - Number(leftIsTarget)
        || Number(right.city.capital) - Number(left.city.capital)
        || right.city.population - left.city.population
        || left.distance - right.distance
        || left.city.id.localeCompare(right.city.id);
    })
    .slice(0, maximumCandidates)
    .map(({ city }) => city);
}
