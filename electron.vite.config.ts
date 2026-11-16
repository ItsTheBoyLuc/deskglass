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
    build: {
      sourcemap: false,
      rollupOptions: { input: resolve('src/renderer/index.html') }
    }
  }
})
