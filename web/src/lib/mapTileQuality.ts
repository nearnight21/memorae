const RETINA_MAP_PARAMETER = 'map-retina';

export function isRetinaMapExperimentEnabled(search: string): boolean {
  return new URLSearchParams(search).get(RETINA_MAP_PARAMETER) === '1';
}
