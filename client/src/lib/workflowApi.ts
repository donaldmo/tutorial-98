export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : '/api'
