import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

// Main is ESM (electron-store is ESM-only). Preload must stay CJS because it runs sandboxed.
export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [
      {
        // Dev only: Vite injects inline styles and an HMR websocket, which the strict production CSP forbids.
        name: 'dev-csp',
        apply: 'serve',
        transformIndexHtml: (html: string) => html
          .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
          .replace("connect-src 'none'", "connect-src 'self' ws://localhost:*")
      }
    ],
    build: {
      sourcemap: false,
      rollupOptions: { input: resolve('src/renderer/index.html') }
    }
  }
})
