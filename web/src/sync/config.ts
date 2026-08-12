export const MEMORY_RECALL_API_URL = (
  import.meta.env.VITE_MEMORY_RECALL_API_URL?.trim() ?? ''
).replace(/\/+$/, '');
