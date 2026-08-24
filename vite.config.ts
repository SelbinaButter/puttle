import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { BRAND } from './src/game/brand.ts'

const DEFAULT_SITE_URL = 'https://selbinabutter.github.io/puttle/'

function brandedAssets(siteUrl: string): Plugin {
  const manifest = {
    name: BRAND.displayTitle,
    short_name: BRAND.displayTitle,
    description: BRAND.tagline,
    start_url: './',
    display: 'standalone',
    background_color: '#eeeade',
    theme_color: '#eeeade',
    icons: [
      { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
  return {
    name: 'branded-assets',
    transformIndexHtml(html) {
      return html
        .replaceAll('__GAME_TITLE__', BRAND.displayTitle)
        .replaceAll('__GAME_TAGLINE__', BRAND.tagline)
        .replaceAll('__SITE_URL__', siteUrl)
    },
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_request, response) => {
        response.setHeader('Content-Type', 'application/manifest+json')
        response.end(JSON.stringify(manifest))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const configured = loadEnv(mode, process.cwd(), '').VITE_SITE_URL || DEFAULT_SITE_URL
  const siteUrl = `${configured.replace(/\/+$/, '')}/`
  return {
    plugins: [react(), brandedAssets(siteUrl)],
    base: './',
    define: {
      'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl),
    },
  }
})
