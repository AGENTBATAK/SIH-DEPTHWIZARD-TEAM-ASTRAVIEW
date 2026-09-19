/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full MapLibre style URL. Overrides every other basemap choice. */
  readonly VITE_MAP_STYLE_URL?: string
  /** Optional MapTiler key. Never commit a real key — use .env.local. */
  readonly VITE_MAPTILER_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
