import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: 'frontend/public',
  resolve: { preserveSymlinks: true },
  server: { proxy: { '/api': { target: 'http://127.0.0.1:3001' } } },
  preview: { proxy: { '/api': { target: 'http://127.0.0.1:3001' } } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Split the heavy, independently-cacheable libraries out of the entry
        // chunk so the landing page is not gated on the map or GeoTIFF readers.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('three') || id.includes('@react-three')) return 'three'
          if (id.includes('maplibre-gl')) return 'maplibre'
          if (id.includes('geotiff')) return 'geotiff'
          if (id.includes('gsap')) return 'gsap'
        },
      },
    },
  },
})
