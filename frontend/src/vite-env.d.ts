/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base da API (backend/api.py). Padrão: http://127.0.0.1:8000 — ver .env.example. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
