import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        how: resolve(import.meta.dirname, 'how.html'),
        'embed-demo': resolve(import.meta.dirname, 'embed-demo.html'),
        frame: resolve(import.meta.dirname, 'frame.html'),
        demo: resolve(import.meta.dirname, 'demo.html'),
        embed: resolve(import.meta.dirname, 'src/embed.ts'),
      },
      output: {
        // A stable URL for the embeddable element: /embed.js
        entryFileNames: (chunk: { name: string }) => (chunk.name === 'embed' ? 'embed.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: { environment: 'node' },
} as any)
