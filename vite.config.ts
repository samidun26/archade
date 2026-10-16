import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import type { Plugin } from 'vite';

// Link-preview crawlers want an absolute image URL. On Vercel the production
// domain is known at build time; elsewhere the relative path is kept.
function absolutePreview(): Plugin {
  return {
    name: 'absolute-preview-image',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
        return host ? html.replace(/content="\.?\/preview\.jpg"/g, `content="https://${host}/preview.jpg"`) : html;
      },
    },
  };
}

// `npm run build` -> regular multi-file build in dist/
// `npm run build:single` -> one self-contained HTML file in dist-single/ (used for the shareable link)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [absolutePreview()],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  server: { host: true },
}));
