export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? '').replace(/\/$/, '')
export const API_BASE_URL = BACKEND_URL ? `${BACKEND_URL}/api` : '/api'
