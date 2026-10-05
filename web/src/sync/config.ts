const configuredApiUrl = import.meta.env?.VITE_MEMORY_RECALL_API_URL?.trim() ?? '';
const isProductionBuild = import.meta.env?.PROD === true;

// Production is deployed with the API behind the same origin as the Web app.
// Keep local development opt-in while avoiding an accidental offline build.
export const MEMORY_RECALL_API_URL = (
  configuredApiUrl || (isProductionBuild ? window.location.origin : '')
).replace(/\/+$/, '');

export const WECHAT_LOGIN_ENABLED = import.meta.env?.VITE_MEMORY_RECALL_WECHAT_ENABLED === '1';
export const EMAIL_LOGIN_ENABLED = import.meta.env?.VITE_MEMORY_RECALL_EMAIL_ENABLED === '1';

export const DEMO_API_URL = (
  import.meta.env?.VITE_MEMORY_RECALL_DEMO_API_URL?.trim()
  || (isProductionBuild ? window.location.origin : '')
).replace(/\/+$/, '');
export const DEMO_ACCESS_TOKEN = import.meta.env?.VITE_MEMORY_RECALL_DEMO_TOKEN?.trim() ?? '';
export const DEMO_SPACE_PASSWORD = import.meta.env?.VITE_MEMORY_RECALL_DEMO_SPACE_PASSWORD ?? '';
