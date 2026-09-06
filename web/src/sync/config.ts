const configuredApiUrl = import.meta.env?.VITE_MEMORY_RECALL_API_URL?.trim() ?? '';
const isProductionBuild = import.meta.env?.PROD === true;

// Production is deployed with the API behind the same origin as the Web app.
// Keep local development opt-in while avoiding an accidental offline build.
export const MEMORY_RECALL_API_URL = (
  configuredApiUrl || (isProductionBuild ? window.location.origin : '')
).replace(/\/+$/, '');
